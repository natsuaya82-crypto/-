using SmartphoneGimmick.Core;

namespace SmartphoneGimmick.Devices
{
    /// <summary>
    /// センサーを使わず、指定された姿勢をそのまま返すシミュレーション実装。
    ///
    /// 用途:
    ///  - Editor の Play モードで実機なしに OrientationManager を検証する
    ///  - 実機でもセンサーが取れない場合に HUD のボタンから手動で状態を切り替える
    ///
    /// 実機ビルドからも除外しない。Phase 1 以降のステージ動作確認でも使うため。
    /// </summary>
    public sealed class SimulatedAttitudeProvider : IDeviceAttitudeProvider
    {
        private OrientationState _simulatedState = OrientationState.Portrait;

        public string SourceName
        {
            get { return "Simulated"; }
        }

        public bool IsAvailable
        {
            get { return true; }
        }

        /// <summary>シミュレーションで再現する姿勢。Unknown は Portrait として扱う。</summary>
        public OrientationState SimulatedState
        {
            get { return _simulatedState; }
            set { _simulatedState = value == OrientationState.Unknown ? OrientationState.Portrait : value; }
        }

        public void Enable()
        {
        }

        public void Disable()
        {
        }

        public DeviceAttitude ReadAttitude()
        {
            return new DeviceAttitude(OrientationMath.StateToGravity(_simulatedState), true);
        }
    }
}
