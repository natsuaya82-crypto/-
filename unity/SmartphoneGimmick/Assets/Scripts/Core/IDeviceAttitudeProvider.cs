namespace SmartphoneGimmick.Core
{
    /// <summary>
    /// 端末姿勢の取得元を抽象化するインターフェース。
    ///
    /// これがあることで、
    ///  - iOS / Android / Editor でセンサー API が違っても上位ロジックを変えずに済む
    ///  - Legacy Input Manager と Input System パッケージの両対応ができる
    ///  - 実機が無くてもシミュレーションで OrientationManager を検証できる
    /// という 3 点を満たす。
    ///
    /// OS の画面自動回転 (Screen.orientation) は実装として使わない。
    /// 姿勢はあくまで物理センサー由来の重力ベクトルから求める。
    /// </summary>
    public interface IDeviceAttitudeProvider
    {
        /// <summary>HUD やログに出す取得元の名前。</summary>
        string SourceName { get; }

        /// <summary>この環境でこの取得元が使えるか。</summary>
        bool IsAvailable { get; }

        /// <summary>センサーを有効化する。Provider 生成後に 1 度だけ呼ぶ。</summary>
        void Enable();

        /// <summary>センサーを無効化する。アプリ終了時・Provider 切り替え時に呼ぶ。</summary>
        void Disable();

        /// <summary>現在フレームの姿勢を読む。取得できない場合は DeviceAttitude.Unavailable。</summary>
        DeviceAttitude ReadAttitude();
    }
}
