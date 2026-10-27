package jp.mahjong.gamblers;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

/* 全画面(没入モード)・画面を消さない・音の自動再生を許可(コントローラー操作でもBGMや効果音が鳴るように) */
public class MainActivity extends BridgeActivity {
    private OnBackPressedCallback backCb;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
        /* Fire TV のリモコンの「戻る」: いきなりアプリを終了せず、まずゲーム側(MJ.Pad.back)に渡す。
           ゲームが「やめますか?」などの確認を出す。ゲームが応答しないとき(読み込み中など)だけ、通常の戻る動作に任せる。 */
        backCb = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv == null) { fallbackBack(); return; }
                wv.evaluateJavascript(
                    "(function(){try{if(window.MJ&&MJ.Pad&&MJ.Pad.back){MJ.Pad.back();return 'ok';}}catch(e){}return 'no';})()",
                    value -> { if (value == null || !value.contains("ok")) fallbackBack(); });
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backCb);
    }

    private void fallbackBack() {
        backCb.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        backCb.setEnabled(true);
    }

    /* ゲームの「おわる」から呼ばれる(Capacitor の App プラグインが使えない場合の予備) */
    public class NativeBridge {
        @JavascriptInterface
        public void exit() { runOnUiThread(() -> finishAndRemoveTask()); }
    }

    @Override
    public void onStart() {
        super.onStart();
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings s = getBridge().getWebView().getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setTextZoom(100);
            getBridge().getWebView().addJavascriptInterface(new NativeBridge(), "MJNative");
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
