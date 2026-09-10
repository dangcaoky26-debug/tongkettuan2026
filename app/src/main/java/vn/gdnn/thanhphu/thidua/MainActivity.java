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
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int MAX_REDIRECTS = 5;

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
            // API được cố định trong ứng dụng.
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.1.1";
        }

        @JavascriptInterface
        public void apiRequest(String requestId, String jsonBody) {
            final String rid = requestId == null ? "" : requestId;
            final String body = jsonBody == null ? "{}" : jsonBody;

            executor.execute(() -> {
                try {
                    String response = postAppsScript(body);
                    callback(rid, response);
                } catch (Exception ex) {
                    String msg = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
                    callback(rid, "{\"ok\":false,\"error\":\"NETWORK_ERROR\",\"message\":" + JSONObject.quote(msg) + "}");
                }
            });
        }

        /**
         * Google Apps Script ContentService thường trả HTTP 302 sau POST rồi chuyển tới
         * script.googleusercontent.com. Android HttpURLConnection không xử lý POST->302
         * nhất quán trên mọi phiên bản, vì vậy ta theo redirect thủ công: POST lần đầu,
         * sau đó GET URL Location để lấy JSON cuối cùng.
         */
        private String postAppsScript(String body) throws Exception {
            HttpURLConnection conn = null;
            try {
                conn = open(API_URL, "POST");
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                conn.setRequestProperty("Accept", "application/json, text/plain, */*");

                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                    os.flush();
                }

                int code = conn.getResponseCode();
                if (isRedirect(code)) {
                    String location = conn.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) {
                        return errorJson("REDIRECT_WITHOUT_LOCATION", code, "Apps Script không trả URL chuyển hướng");
                    }
                    return getFollowingRedirects(location, 1);
                }
                return readResponse(conn, code);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }

        private String getFollowingRedirects(String url, int redirectCount) throws Exception {
            if (redirectCount > MAX_REDIRECTS) {
                return errorJson("TOO_MANY_REDIRECTS", 0, "Quá nhiều lần chuyển hướng");
            }

            HttpURLConnection conn = null;
            try {
                conn = open(url, "GET");
                conn.setRequestProperty("Accept", "application/json, text/plain, */*");
                int code = conn.getResponseCode();

                if (isRedirect(code)) {
                    String location = conn.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) {
                        return errorJson("REDIRECT_WITHOUT_LOCATION", code, "Thiếu URL chuyển hướng");
                    }
                    return getFollowingRedirects(location, redirectCount + 1);
                }
                return readResponse(conn, code);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }

        private HttpURLConnection open(String url, String method) throws Exception {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod(method);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setUseCaches(false);
            conn.setRequestProperty("User-Agent", "ThiDuaTuan-Android/1.1.1");
            return conn;
        }

        private boolean isRedirect(int code) {
            return code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == HttpURLConnection.HTTP_SEE_OTHER
                    || code == 307
                    || code == 308;
        }

        private String readResponse(HttpURLConnection conn, int code) throws Exception {
            InputStream stream = code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream();
            StringBuilder sb = new StringBuilder();
            if (stream != null) {
                try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                }
            }

            String response = sb.toString().trim();
            if (response.isEmpty()) {
                return errorJson("EMPTY_RESPONSE", code, "Máy chủ không trả dữ liệu");
            }

            // Apps Script API của ứng dụng phải trả JSON. Nếu nhận HTML thì thường là
            // trang đăng nhập/quyền truy cập hoặc một trang lỗi của Google.
            if (response.startsWith("<") || response.toLowerCase().contains("<html")) {
                return errorJson("HTML_RESPONSE", code, "Web App trả HTML thay vì JSON");
            }

            return response;
        }

        private String errorJson(String error, int httpCode, String message) {
            return "{\"ok\":false,\"error\":" + JSONObject.quote(error)
                    + ",\"httpCode\":" + httpCode
                    + ",\"message\":" + JSONObject.quote(message) + "}";
        }

        private void callback(String requestId, String response) {
            runOnUiThread(() -> {
                String js = "window.__androidApiResponse(" + JSONObject.quote(requestId) + "," + JSONObject.quote(response) + ");";
                webView.evaluateJavascript(js, null);
            });
        }
    }
}
