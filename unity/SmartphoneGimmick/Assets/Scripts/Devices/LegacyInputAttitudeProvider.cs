#if ENABLE_LEGACY_INPUT_MANAGER
using SmartphoneGimmick.Core;
using UnityEngine;

namespace SmartphoneGimmick.Devices
{
    /// <summary>
    /// 旧 Input Manager (UnityEngine.Input) 経由で端末姿勢を取得する実装。
    /// iOS / Android の両方でそのまま動く。
    ///
    /// 優先順位:
    ///   1. Input.gyro.gravity   … CoreMotion / Android Sensor が計算した重力成分。ノイズが少ない。
    ///   2. Input.acceleration   … 加速度計の生値。ジャイロ非搭載端末向けフォールバック。
    ///
    /// Input.compensateSensors は false に固定する。
    /// true にすると Unity が画面向きに合わせてセンサー値を回してしまい、
    /// 「OS の画面回転をゲームロジックにしない」という要件を壊すため。
    /// </summary>
    public sealed class LegacyInputAttitudeProvider : IDeviceAttitudeProvider
    {
        private bool _useGyroscope;
        private bool _enabled;

        public string SourceName
        {
            get { return _useGyroscope ? "Legacy Input (gyro.gravity)" : "Legacy Input (accelerometer)"; }
        }

        public bool IsAvailable
        {
            get { return SystemInfo.supportsGyroscope || SystemInfo.supportsAccelerometer; }
        }

        public void Enable()
        {
            if (_enabled)
            {
                return;
            }

            Input.compensateSensors = false;

            if (SystemInfo.supportsGyroscope)
            {
                Input.gyro.enabled = true;
                _useGyroscope = true;
            }

            _enabled = true;
        }

        public void Disable()
        {
            if (!_enabled)
            {
                return;
            }

            if (_useGyroscope)
            {
                Input.gyro.enabled = false;
            }

            _enabled = false;
        }

        public DeviceAttitude ReadAttitude()
        {
            if (!_enabled)
            {
                return DeviceAttitude.Unavailable;
            }

            Vector3 rawGravity = _useGyroscope ? Input.gyro.gravity : Input.acceleration;
            return DeviceAttitude.FromRawGravity(rawGravity);
        }
    }
}
#endif
