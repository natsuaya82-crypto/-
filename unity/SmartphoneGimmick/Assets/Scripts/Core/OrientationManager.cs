using System;
using SmartphoneGimmick.Devices;
using UnityEngine;

namespace SmartphoneGimmick.Core
{
    /// <summary>
    /// 端末の物理姿勢を監視し、OrientationState として公開する Phase 0 の中核システム。
    ///
    /// 設計上の約束:
    ///  - OS の画面自動回転 (Screen.orientation) は一切参照しない。
    ///    アプリ自体は Portrait 固定でビルドし、姿勢はセンサーから自前で判定する。
    ///  - 判定結果は「状態 (enum)」と「連続角 (float)」の両方を公開する。
    ///    GravityManager は連続角も使いたいが、StageManager やギミックは状態だけで足りるため。
    ///  - 姿勢が変わった瞬間は OrientationChanged イベントで通知する。
    ///    毎フレームのポーリングでも、イベント駆動でも、どちらでも使えるようにする。
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Smartphone Gimmick/Orientation Manager")]
    public sealed class OrientationManager : MonoBehaviour
    {
        private const float DefaultGravitySmoothingHalfLifeSeconds = 0.06f;
        private const float DefaultHysteresisDegrees = 12f;
        private const float DefaultStabilizationSeconds = 0.15f;
        private const float DefaultFlatPlanarGravityThreshold = 0.35f;

        [Header("姿勢データの取得元")]
        [Tooltip("Automatic: 実機センサー優先。DeviceSensor: センサーのみ。Simulated: 手動切り替えのみ。")]
        [SerializeField]
        private AttitudeSourceMode _sourceMode = AttitudeSourceMode.Automatic;

        [Tooltip("センサーが使えないときにシミュレーションへ切り替えるか (Automatic のときのみ有効)。")]
        [SerializeField]
        private bool _allowSimulationFallback = true;

        [Tooltip("重力ベクトルの上下が逆に判定される端末・API のための補正。通常は OFF。")]
        [SerializeField]
        private bool _invertGravity;

        [Header("判定パラメータ")]
        [Tooltip("重力ベクトルの平滑化の半減期 (秒)。大きいほど滑らかだが反応が遅くなる。")]
        [SerializeField, Range(0f, 0.5f)]
        private float _gravitySmoothingHalfLifeSeconds = DefaultGravitySmoothingHalfLifeSeconds;

        [Tooltip("境界角でのバタつきを防ぐ余裕角 (度)。45 度 + この値を超えて初めて隣の姿勢へ移る。")]
        [SerializeField, Range(0f, 30f)]
        private float _hysteresisDegrees = DefaultHysteresisDegrees;

        [Tooltip("新しい姿勢がこの秒数続いて初めて確定させる。瞬間的な揺れを無視するため。")]
        [SerializeField, Range(0f, 1f)]
        private float _stabilizationSeconds = DefaultStabilizationSeconds;

        [Tooltip("画面平面成分がこの値未満なら平置き(水平)とみなし、姿勢判定を保留する。")]
        [SerializeField, Range(0.05f, 1f)]
        private float _flatPlanarGravityThreshold = DefaultFlatPlanarGravityThreshold;

        private IDeviceAttitudeProvider _provider;
        private SimulatedAttitudeProvider _simulatedProvider;
        private Vector3 _smoothedGravity = Vector3.down;
        private OrientationState _pendingState = OrientationState.Unknown;
        private float _pendingElapsedSeconds;
        private bool _hasSmoothedGravity;

        /// <summary>姿勢が確定的に変化したときに (直前の状態, 新しい状態) を通知する。</summary>
        public event Action<OrientationState, OrientationState> OrientationChanged;

        /// <summary>現在確定している端末姿勢。</summary>
        public OrientationState Current { get; private set; } = OrientationState.Unknown;

        /// <summary>Portrait を 0 度とした連続的なロール角 (度、反時計回りが正)。</summary>
        public float RollDegrees { get; private set; }

        /// <summary>平滑化済みの端末ローカル重力ベクトル (単位ベクトル)。</summary>
        public Vector3 Gravity
        {
            get { return _smoothedGravity; }
        }

        /// <summary>そのフレームに読めた生の重力ベクトル。HUD 表示・調査用。</summary>
        public Vector3 RawGravity { get; private set; }

        /// <summary>端末が水平に近く、画面平面の回転を判定できない状態か。</summary>
        public bool IsFlat { get; private set; }

        /// <summary>姿勢データを取得できているか。</summary>
        public bool IsAttitudeAvailable { get; private set; }

        /// <summary>実センサーではなくシミュレーション入力で動作しているか。</summary>
        public bool IsSimulated
        {
            get { return _simulatedProvider != null; }
        }

        /// <summary>現在の取得元の名前。HUD 表示・ログ用。</summary>
        public string SourceName
        {
            get { return _provider != null ? _provider.SourceName : "None"; }
        }

        private void Awake()
        {
            CreateProvider();
        }

        private void OnDestroy()
        {
            DestroyProvider();
        }

        private void Update()
        {
            DeviceAttitude attitude = ReadAttitude();
            IsAttitudeAvailable = attitude.IsAvailable;
            if (!attitude.IsAvailable)
            {
                return;
            }

            RawGravity = attitude.Gravity;
            UpdateSmoothedGravity(attitude.Gravity, Time.deltaTime);
            UpdateOrientation(Time.deltaTime);
        }

        /// <summary>
        /// シミュレーション動作中に姿勢を手動で指定する。
        /// センサー動作中は何もしない (実機の値を上書きしないため)。
        /// </summary>
        public void SetSimulatedOrientation(OrientationState state)
        {
            if (_simulatedProvider == null)
            {
                return;
            }

            _simulatedProvider.SimulatedState = state;
        }

        /// <summary>取得元を切り替える。Inspector から _sourceMode を変えた後の反映にも使える。</summary>
        public void ChangeSourceMode(AttitudeSourceMode mode)
        {
            if (_sourceMode == mode && _provider != null)
            {
                return;
            }

            _sourceMode = mode;
            DestroyProvider();
            CreateProvider();
        }

        private void CreateProvider()
        {
            _provider = DeviceAttitudeProviderFactory.Create(_sourceMode, _allowSimulationFallback);
            _simulatedProvider = _provider as SimulatedAttitudeProvider;

            if (_provider == null)
            {
                Debug.LogWarning("[OrientationManager] 利用可能な姿勢取得元がありません。姿勢は Unknown のままになります。", this);
                return;
            }

            _provider.Enable();
            _hasSmoothedGravity = false;
        }

        private void DestroyProvider()
        {
            if (_provider == null)
            {
                return;
            }

            _provider.Disable();
            _provider = null;
            _simulatedProvider = null;
        }

        private DeviceAttitude ReadAttitude()
        {
            if (_provider == null)
            {
                return DeviceAttitude.Unavailable;
            }

            DeviceAttitude attitude = _provider.ReadAttitude();
            if (!attitude.IsAvailable || !_invertGravity)
            {
                return attitude;
            }

            return new DeviceAttitude(-attitude.Gravity, true);
        }

        private void UpdateSmoothedGravity(Vector3 gravity, float deltaTime)
        {
            if (!_hasSmoothedGravity)
            {
                _smoothedGravity = gravity;
                _hasSmoothedGravity = true;
                return;
            }

            float factor = OrientationMath.SmoothingFactor(_gravitySmoothingHalfLifeSeconds, deltaTime);
            _smoothedGravity = Vector3.Slerp(_smoothedGravity, gravity, factor);
        }

        private void UpdateOrientation(float deltaTime)
        {
            var planarGravity = new Vector2(_smoothedGravity.x, _smoothedGravity.y);
            IsFlat = planarGravity.magnitude < _flatPlanarGravityThreshold;

            // 平置き中は画面平面の回転が定義できない。直前の姿勢を保持する。
            if (IsFlat)
            {
                ResetPending();
                return;
            }

            RollDegrees = OrientationMath.GravityToRollDegrees(_smoothedGravity);
            CommitWhenStable(ResolveCandidate(RollDegrees), deltaTime);
        }

        /// <summary>
        /// ヒステリシス付きで候補の姿勢を決める。
        /// 現在の姿勢の基準角から (45 度 + 余裕角) 以上離れるまでは姿勢を変えない。
        /// </summary>
        private OrientationState ResolveCandidate(float rollDegrees)
        {
            if (Current == OrientationState.Unknown)
            {
                return OrientationMath.RollToNearestState(rollDegrees);
            }

            float distance = OrientationMath.AngleDistanceToState(rollDegrees, Current);
            bool leftCurrentSector = distance > OrientationMath.SectorHalfAngleDegrees + _hysteresisDegrees;

            return leftCurrentSector ? OrientationMath.RollToNearestState(rollDegrees) : Current;
        }

        /// <summary>候補姿勢が安定時間だけ継続したら確定させ、イベントを発火する。</summary>
        private void CommitWhenStable(OrientationState candidate, float deltaTime)
        {
            if (candidate == Current)
            {
                ResetPending();
                return;
            }

            if (candidate != _pendingState)
            {
                _pendingState = candidate;
                _pendingElapsedSeconds = 0f;
            }

            _pendingElapsedSeconds += deltaTime;
            if (_pendingElapsedSeconds < _stabilizationSeconds)
            {
                return;
            }

            OrientationState previous = Current;
            Current = candidate;
            ResetPending();

            if (OrientationChanged != null)
            {
                OrientationChanged.Invoke(previous, Current);
            }
        }

        private void ResetPending()
        {
            _pendingState = Current;
            _pendingElapsedSeconds = 0f;
        }
    }
}
