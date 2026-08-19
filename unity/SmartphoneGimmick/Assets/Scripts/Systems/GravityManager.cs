using System;
using SmartphoneGimmick.Core;
using UnityEngine;

namespace SmartphoneGimmick.Systems
{
    /// <summary>重力方向の追従方法。</summary>
    public enum GravityFollowMode
    {
        /// <summary>確定した OrientationState の 4 方向にスナップする。パズルとして挙動が読みやすい。</summary>
        SnapToOrientationState = 0,

        /// <summary>実際の傾き角にそのまま追従する。演出寄りの挙動。</summary>
        FollowRawTilt = 1,
    }

    /// <summary>
    /// 端末姿勢からゲーム世界の重力方向を決めるシステム。
    ///
    /// Phase 0 での責務はここまでに限定する:
    ///   - OrientationManager の結果を「世界座標の重力ベクトル」に変換して公開する
    ///   - (任意) Unity の物理エンジンへ反映する
    ///
    /// 実際に物を落とす・プレイヤーを動かすのは Phase 1 以降の PlayerController / StageManager の責務。
    /// ここでは値を提供するだけに留める。
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Smartphone Gimmick/Gravity Manager")]
    public sealed class GravityManager : MonoBehaviour
    {
        private const float EarthGravityMagnitude = 9.81f;
        private const float DefaultRotationHalfLifeSeconds = 0.08f;

        [Header("参照")]
        [Tooltip("未設定なら同じ GameObject → シーン内から自動で探す。")]
        [SerializeField]
        private OrientationManager _orientationManager;

        [Header("重力設定")]
        [SerializeField]
        private GravityFollowMode _followMode = GravityFollowMode.SnapToOrientationState;

        [Tooltip("重力の大きさ (m/s^2)。")]
        [SerializeField]
        private float _gravityMagnitude = EarthGravityMagnitude;

        [Tooltip("重力方向の回転の半減期 (秒)。0 で即時。")]
        [SerializeField, Range(0f, 0.5f)]
        private float _rotationHalfLifeSeconds = DefaultRotationHalfLifeSeconds;

        [Tooltip("Physics.gravity を実際に書き換えるか。Phase 0 では既定 OFF (表示のみ)。")]
        [SerializeField]
        private bool _applyToUnityPhysics;

        private Vector3 _gravityDirection = Vector3.down;

        /// <summary>重力方向が (スナップモードで) 切り替わったときに通知する。</summary>
        public event Action<Vector3> GravityDirectionChanged;

        /// <summary>現在の世界座標での重力方向 (単位ベクトル)。</summary>
        public Vector3 GravityDirection
        {
            get { return _gravityDirection; }
        }

        /// <summary>現在の重力ベクトル (方向 × 大きさ)。</summary>
        public Vector3 Gravity
        {
            get { return _gravityDirection * _gravityMagnitude; }
        }

        /// <summary>重力方向を「下」とみなしたときの世界回転。将来 WorldRotationManager が利用する想定。</summary>
        public Quaternion WorldUpRotation
        {
            get { return Quaternion.FromToRotation(Vector3.down, _gravityDirection); }
        }

        private void Awake()
        {
            _orientationManager = SceneComponentLocator.Resolve(this, _orientationManager);
        }

        private void OnEnable()
        {
            if (_orientationManager == null)
            {
                return;
            }

            _orientationManager.OrientationChanged += HandleOrientationChanged;
        }

        private void OnDisable()
        {
            if (_orientationManager == null)
            {
                return;
            }

            _orientationManager.OrientationChanged -= HandleOrientationChanged;
        }

        private void Update()
        {
            if (_orientationManager == null)
            {
                return;
            }

            Vector3 target = ResolveTargetDirection();
            float factor = OrientationMath.SmoothingFactor(_rotationHalfLifeSeconds, Time.deltaTime);
            _gravityDirection = Vector3.Slerp(_gravityDirection, target, factor);

            if (_applyToUnityPhysics)
            {
                Physics.gravity = Gravity;
            }
        }

        private Vector3 ResolveTargetDirection()
        {
            switch (_followMode)
            {
                case GravityFollowMode.FollowRawTilt:
                    return OrientationMath.RollToDownDirection(_orientationManager.RollDegrees);

                default:
                    return OrientationMath.StateToGravity(_orientationManager.Current);
            }
        }

        private void HandleOrientationChanged(OrientationState previous, OrientationState current)
        {
            if (GravityDirectionChanged != null)
            {
                GravityDirectionChanged.Invoke(OrientationMath.StateToGravity(current) * _gravityMagnitude);
            }
        }
    }
}
