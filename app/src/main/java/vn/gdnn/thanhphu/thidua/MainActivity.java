package vn.gdnn.thanhphu.thidua;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String API_URL = "https://script.google.com/macros/s/AKfycbzgyZkUcSWPaO1PYZ_RWUyeS0KXnT9A9FZ_g_wcLQqknf7uYUt1NAXLapHMdIeY_gmq/exec";

    private WebView webView;
    private final ExecutorService executor = Executors.newFixedThreadPool(3);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new AppBridge(this), "Android");
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private final class AppBridge {
        AppBridge(Context ctx) {}

        @JavascriptInterface
        public String getApiUrl() {
            return API_URL;
        }

        @JavascriptInterface
        public void setApiUrl(String url) {
            // API được cố định trong ứng dụng để tránh người dùng thay đổi nhầm.
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.1.0";
        }

        @JavascriptInterface
        public void apiRequest(String requestId, String jsonBody) {
            final String rid = requestId == null ? "" : requestId;
            final String body = jsonBody == null ? "{}" : jsonBody;

            executor.execute(() -> {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(API_URL);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(12000);
                    conn.setReadTimeout(20000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    conn.setRequestProperty("Accept", "application/json");
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    conn.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(bytes);
                    }
                    int code = conn.getResponseCode();
                    InputStream stream = code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream();
                    StringBuilder sb = new StringBuilder();
                    if (stream != null) {
                        try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                            String line;
                            while ((line = br.readLine()) != null) sb.append(line);
                        }
                    }
                    String response = sb.length() == 0
                            ? "{\"ok\":false,\"error\":\"EMPTY_RESPONSE\",\"httpCode\":" + code + "}"
                            : sb.toString();
                    callback(rid, response);
                } catch (Exception ex) {
                    String msg = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
                    callback(rid, "{\"ok\":false,\"error\":\"NETWORK_ERROR\",\"message\":" + JSONObject.quote(msg) + "}");
                } finally {
                    if (conn != null) conn.disconnect();
                }
            });
        }

        private void callback(String requestId, String response) {
            runOnUiThread(() -> {
                String js = "window.__androidApiResponse(" + JSONObject.quote(requestId) + "," + JSONObject.quote(response) + ");";
                webView.evaluateJavascript(js, null);
            });
        }
    }
}
