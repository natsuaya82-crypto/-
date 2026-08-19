using UnityEngine;

namespace SmartphoneGimmick.Core
{
    /// <summary>
    /// 1 フレーム分の端末姿勢データ。
    ///
    /// Gravity は「端末ローカル座標系における重力の向き」を表す単位ベクトル。
    ///   x: 画面右方向 / y: 画面上方向 / z: 画面手前方向
    /// 端末を Portrait で立てて持つと Gravity ≒ (0, -1, 0) になる。
    ///
    /// センサー実装 (加速度計 / ジャイロ / Input System) の差を、この 1 つの型に吸収する。
    /// </summary>
    public readonly struct DeviceAttitude
    {
        public readonly Vector3 Gravity;
        public readonly bool IsAvailable;

        public DeviceAttitude(Vector3 gravity, bool isAvailable)
        {
            Gravity = gravity;
            IsAvailable = isAvailable;
        }

        /// <summary>センサーが値を返さなかったフレームを表す。</summary>
        public static DeviceAttitude Unavailable
        {
            get { return new DeviceAttitude(Vector3.zero, false); }
        }

        /// <summary>生ベクトルを正規化して有効な姿勢として返す。長さが不正な場合は Unavailable。</summary>
        public static DeviceAttitude FromRawGravity(Vector3 rawGravity)
        {
            float sqrMagnitude = rawGravity.sqrMagnitude;
            if (sqrMagnitude < OrientationMath.MinValidGravitySqrMagnitude)
            {
                return Unavailable;
            }

            return new DeviceAttitude(rawGravity / Mathf.Sqrt(sqrMagnitude), true);
        }
    }
}
