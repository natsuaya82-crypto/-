namespace SmartphoneGimmick.Core
{
    /// <summary>
    /// 端末そのものの物理的な姿勢。
    /// OS の画面自動回転 (Screen.orientation) とは独立して、重力ベクトルから判定する。
    ///
    /// 回転方向の定義 (画面を正面から見た状態):
    ///   Portrait            : 通常。画面上端が上。
    ///   LandscapeLeft       : Portrait から反時計回りに 90 度回した状態 (画面上端が左)。
    ///   PortraitUpsideDown  : Portrait から 180 度回した状態 (画面上端が下)。
    ///   LandscapeRight      : Portrait から時計回りに 90 度回した状態 (画面上端が右)。
    ///
    /// これは UnityEngine.ScreenOrientation の命名規則と同じ向きの定義。
    /// </summary>
    public enum OrientationState
    {
        /// <summary>判定不能。センサー未取得、または初回判定確定前。</summary>
        Unknown = 0,
        Portrait = 1,
        LandscapeLeft = 2,
        PortraitUpsideDown = 3,
        LandscapeRight = 4,
    }

    /// <summary>姿勢データの取得元。Inspector から強制切り替えできるようにするための指定。</summary>
    public enum AttitudeSourceMode
    {
        /// <summary>実機センサーを優先し、使えなければシミュレーションへフォールバックする。</summary>
        Automatic = 0,

        /// <summary>実機センサーのみを使う。使えない場合は判定不能 (Unknown) のまま。</summary>
        DeviceSensor = 1,

        /// <summary>常にシミュレーション入力を使う (Editor 検証・実機での手動確認用)。</summary>
        Simulated = 2,
    }

    public static class OrientationStateExtensions
    {
        /// <summary>HUD 表示や将来のログ出力で使う短い表示名。</summary>
        public static string ToDisplayName(this OrientationState state)
        {
            switch (state)
            {
                case OrientationState.Portrait: return "Portrait";
                case OrientationState.LandscapeLeft: return "Landscape Left";
                case OrientationState.PortraitUpsideDown: return "Portrait Upside Down";
                case OrientationState.LandscapeRight: return "Landscape Right";
                default: return "Unknown";
            }
        }

        /// <summary>Portrait / PortraitUpsideDown なら true。</summary>
        public static bool IsPortraitAxis(this OrientationState state)
        {
            return state == OrientationState.Portrait || state == OrientationState.PortraitUpsideDown;
        }

        /// <summary>LandscapeLeft / LandscapeRight なら true。</summary>
        public static bool IsLandscapeAxis(this OrientationState state)
        {
            return state == OrientationState.LandscapeLeft || state == OrientationState.LandscapeRight;
        }
    }
}
