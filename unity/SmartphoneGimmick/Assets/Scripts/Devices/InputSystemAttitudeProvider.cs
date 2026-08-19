#if ENABLE_INPUT_SYSTEM
using SmartphoneGimmick.Core;
using UnityEngine;
using UnityEngine.InputSystem;

namespace SmartphoneGimmick.Devices
{
    /// <summary>
    /// Input System パッケージ経由で端末姿勢を取得する実装。
    /// プロジェクトの Active Input Handling が "Input System Package" / "Both" のときに使われる。
    ///
    /// 重要:
    ///   InputSettings.compensateForScreenOrientation は既定で true で、
    ///   Unity が現在の画面向きに合わせてセンサー値を回転させてしまう。
    ///   本作は端末の物理姿勢そのものを入力として扱うため false に固定する。
    /// </summary>
    public sealed class InputSystemAttitudeProvider : IDeviceAttitudeProvider
    {
        private GravitySensor _gravitySensor;
        private Accelerometer _accelerometer;
        private bool _enabled;

        public string SourceName
        {
            get
            {
                if (_gravitySensor != null)
                {
                    return "Input System (GravitySensor)";
                }

                return _accelerometer != null ? "Input System (Accelerometer)" : "Input System (none)";
            }
        }

        public bool IsAvailable
        {
            get { return GravitySensor.current != null || Accelerometer.current != null; }
        }

        public void Enable()
        {
            if (_enabled)
            {
                return;
            }

            InputSystem.settings.compensateForScreenOrientation = false;

            if (GravitySensor.current != null)
            {
                _gravitySensor = GravitySensor.current;
                InputSystem.EnableDevice(_gravitySensor);
            }
            else if (Accelerometer.current != null)
            {
                _accelerometer = Accelerometer.current;
                InputSystem.EnableDevice(_accelerometer);
            }

            _enabled = true;
        }

        public void Disable()
        {
            if (!_enabled)
            {
                return;
            }

            if (_gravitySensor != null)
            {
                InputSystem.DisableDevice(_gravitySensor);
                _gravitySensor = null;
            }

            if (_accelerometer != null)
            {
                InputSystem.DisableDevice(_accelerometer);
                _accelerometer = null;
            }

            _enabled = false;
        }

        public DeviceAttitude ReadAttitude()
        {
            if (!_enabled)
            {
                return DeviceAttitude.Unavailable;
            }

            if (_gravitySensor != null)
            {
                return DeviceAttitude.FromRawGravity(_gravitySensor.gravity.ReadValue());
            }

            if (_accelerometer != null)
            {
                return DeviceAttitude.FromRawGravity(_accelerometer.acceleration.ReadValue());
            }

            return DeviceAttitude.Unavailable;
        }
    }
}
#endif
