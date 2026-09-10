package vn.gdnn.thanhphu.thidua;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
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
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class MainActivity extends Activity {
    private static final String API_URL = "https://script.google.com/macros/s/AKfycbzgyZkUcSWPaO1PYZ_RWUyeS0KXnT9A9FZ_g_wcLQqknf7uYUt1NAXLapHMdIeY_gmq/exec";
    private static final String APP_VERSION = "1.6.3";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int MAX_REDIRECTS = 8;

    private WebView webView;
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(40, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)
            .build();

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
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AppBridge(this), "Android");
        webView.loadUrl("file:///android_asset/index.html?v=" + APP_VERSION);
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
        @JavascriptInterface public String getApiUrl() { return API_URL; }
        @JavascriptInterface public void setApiUrl(String url) { }
        @JavascriptInterface public String getAppVersion() { return APP_VERSION; }
        @JavascriptInterface public void apiRequest(String requestId, String jsonBody) {
            final String rid = requestId == null ? "" : requestId;
            final String body = jsonBody == null ? "{}" : jsonBody;
            executor.execute(() -> {
                String response;
                try {
                    response = postWithOkHttp(body);
                    if (looksLikeTransportError(response)) response = postWithUrlConnection(body);
                } catch (Exception first) {
                    try { response = postWithUrlConnection(body); }
                    catch (Exception second) {
                        String msg = second.getMessage() == null ? second.getClass().getSimpleName() : second.getMessage();
                        response = errorJson("NETWORK_ERROR", 0, msg);
                    }
                }
                callback(rid, response);
            });
        }
        private String postWithOkHttp(String body) throws Exception {
            MediaType type = MediaType.get("text/plain; charset=utf-8");
            RequestBody requestBody = RequestBody.create(body, type);
            Request request = new Request.Builder().url(API_URL).post(requestBody)
                    .header("Accept", "application/json, text/plain, */*")
                    .header("Cache-Control", "no-cache")
                    .header("User-Agent", "ThiDuaTuan-Android/" + APP_VERSION).build();
            try (Response response = httpClient.newCall(request).execute()) {
                int code = response.code();
                String raw = response.body() == null ? "" : response.body().string().trim();
                return validateResponse(raw, code);
            }
        }
        private String postWithUrlConnection(String body) throws Exception {
            HttpURLConnection conn = null;
            try {
                conn = open(API_URL, "POST"); conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
                conn.setRequestProperty("Accept", "application/json, text/plain, */*");
                conn.setRequestProperty("Cache-Control", "no-cache");
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8); conn.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream os = conn.getOutputStream()) { os.write(bytes); os.flush(); }
                int code = conn.getResponseCode();
                if (isRedirect(code)) {
                    String location = conn.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) return errorJson("REDIRECT_WITHOUT_LOCATION", code, "Google không trả URL chuyển hướng");
                    return getFollowingRedirects(location, 1);
                }
                return readResponse(conn, code);
            } finally { if (conn != null) conn.disconnect(); }
        }
        private String getFollowingRedirects(String url, int redirectCount) throws Exception {
            if (redirectCount > MAX_REDIRECTS) return errorJson("TOO_MANY_REDIRECTS", 0, "Quá nhiều lần chuyển hướng");
            HttpURLConnection conn = null;
            try {
                conn = open(url, "GET"); conn.setRequestProperty("Accept", "application/json, text/plain, */*"); conn.setRequestProperty("Cache-Control", "no-cache");
                int code = conn.getResponseCode();
                if (isRedirect(code)) {
                    String location = conn.getHeaderField("Location");
                    if (location == null || location.trim().isEmpty()) return errorJson("REDIRECT_WITHOUT_LOCATION", code, "Thiếu URL chuyển hướng");
                    return getFollowingRedirects(location, redirectCount + 1);
                }
                return readResponse(conn, code);
            } finally { if (conn != null) conn.disconnect(); }
        }
        private HttpURLConnection open(String url, String method) throws Exception {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection(); conn.setInstanceFollowRedirects(false); conn.setRequestMethod(method);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS); conn.setReadTimeout(READ_TIMEOUT_MS); conn.setUseCaches(false);
            conn.setRequestProperty("User-Agent", "ThiDuaTuan-Android/" + APP_VERSION); return conn;
        }
        private boolean isRedirect(int code) { return code == 301 || code == 302 || code == 303 || code == 307 || code == 308; }
        private String readResponse(HttpURLConnection conn, int code) throws Exception {
            InputStream stream = code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream(); StringBuilder sb = new StringBuilder();
            if (stream != null) try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) { String line; while ((line = br.readLine()) != null) sb.append(line); }
            return validateResponse(sb.toString().trim(), code);
        }
        private String validateResponse(String response, int code) {
            if (response == null || response.trim().isEmpty()) return errorJson("EMPTY_RESPONSE", code, "Hệ thống không trả dữ liệu");
            String lower = response.toLowerCase();
            if (response.startsWith("<") || lower.contains("<html") || lower.contains("<!doctype")) return errorJson("HTML_RESPONSE", code, "Google trả trang HTML thay vì dữ liệu ứng dụng");
            try { new JSONObject(response); return response; }
            catch (Exception ex) { return errorJson("BAD_JSON", code, "Phản hồi không phải JSON hợp lệ"); }
        }
        private boolean looksLikeTransportError(String response) {
            if (response == null) return true;
            return response.contains("\"error\":\"HTML_RESPONSE\"") || response.contains("\"error\":\"EMPTY_RESPONSE\"") || response.contains("\"error\":\"BAD_JSON\"");
        }
        private String errorJson(String error, int httpCode, String message) {
            return "{\"ok\":false,\"error\":" + JSONObject.quote(error) + ",\"httpCode\":" + httpCode + ",\"message\":" + JSONObject.quote(message) + "}";
        }
        private void callback(String requestId, String response) {
            runOnUiThread(() -> { if (webView == null) return; String js = "window.__androidApiResponse(" + JSONObject.quote(requestId) + "," + JSONObject.quote(response) + ");"; webView.evaluateJavascript(js, null); });
        }
    }
}
