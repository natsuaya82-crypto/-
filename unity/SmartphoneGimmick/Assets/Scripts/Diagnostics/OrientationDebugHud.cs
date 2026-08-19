using SmartphoneGimmick.Core;
using SmartphoneGimmick.Systems;
using UnityEngine;

namespace SmartphoneGimmick.Diagnostics
{
    /// <summary>
    /// Phase 0 の検証用 HUD。現在の OrientationState と姿勢の生データを画面に表示する。
    ///
    /// IMGUI (OnGUI) を使う理由:
    ///   Canvas / Font / TextMeshPro などのアセットを一切必要とせず、
    ///   スクリプトだけで実機表示まで到達できるため。Phase 0 の検証専用。
    ///   本番 UI は Phase 1 以降で別途用意し、このコンポーネントは外す。
    /// </summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Smartphone Gimmick/Orientation Debug HUD")]
    public sealed class OrientationDebugHud : MonoBehaviour
    {
        private const float ReferenceScreenHeight = 1280f;
        private const int BaseTitleFontSize = 44;
        private const int BaseBodyFontSize = 26;
        private const float PanelMarginPixels = 24f;
        private const float PanelWidthRatio = 0.92f;
        private const float SimulationButtonHeight = 64f;

        private static readonly OrientationState[] SelectableStates =
        {
            OrientationState.Portrait,
            OrientationState.LandscapeLeft,
            OrientationState.PortraitUpsideDown,
            OrientationState.LandscapeRight,
        };

        [Header("参照")]
        [SerializeField]
        private OrientationManager _orientationManager;

        [SerializeField]
        private GravityManager _gravityManager;

        [Header("表示")]
        [Tooltip("HUD 全体の表示倍率。")]
        [SerializeField, Range(0.5f, 2f)]
        private float _scale = 1f;

        [Tooltip("シミュレーション動作中に、姿勢を切り替えるボタンを表示する。")]
        [SerializeField]
        private bool _showSimulationButtons = true;

        [Tooltip("検証中に画面が自動消灯しないようにする。")]
        [SerializeField]
        private bool _keepScreenAwake = true;

        private GUIStyle _titleStyle;
        private GUIStyle _bodyStyle;
        private GUIStyle _buttonStyle;

        private void Awake()
        {
            _orientationManager = SceneComponentLocator.Resolve(this, _orientationManager);
            _gravityManager = SceneComponentLocator.Resolve(this, _gravityManager);

            if (_keepScreenAwake)
            {
                Screen.sleepTimeout = SleepTimeout.NeverSleep;
            }
        }

        private void OnGUI()
        {
            if (_orientationManager == null)
            {
                return;
            }

            EnsureStyles();

            float panelWidth = Screen.width * PanelWidthRatio;
            float panelHeight = Screen.height - (PanelMarginPixels * 2f);
            var area = new Rect(PanelMarginPixels, PanelMarginPixels, panelWidth, panelHeight);

            GUILayout.BeginArea(area);
            GUILayout.BeginVertical(GUI.skin.box);

            DrawOrientationSection();
            DrawSensorSection();
            DrawGravitySection();
            DrawSimulationSection();

            GUILayout.EndVertical();
            GUILayout.EndArea();
        }

        private void DrawOrientationSection()
        {
            GUILayout.Label("ORIENTATION STATE", _bodyStyle);
            GUILayout.Label(_orientationManager.Current.ToDisplayName(), _titleStyle);
            GUILayout.Label(string.Format("Roll: {0,7:F1} deg", _orientationManager.RollDegrees), _bodyStyle);
            GUILayout.Space(PanelMarginPixels * 0.5f);
        }

        private void DrawSensorSection()
        {
            GUILayout.Label("SENSOR", _bodyStyle);
            GUILayout.Label("Source: " + _orientationManager.SourceName, _bodyStyle);
            GUILayout.Label("Available: " + _orientationManager.IsAttitudeAvailable, _bodyStyle);
            GUILayout.Label("Flat (face up/down): " + _orientationManager.IsFlat, _bodyStyle);

            Vector3 raw = _orientationManager.RawGravity;
            GUILayout.Label(string.Format("Raw gravity : ({0,6:F2}, {1,6:F2}, {2,6:F2})", raw.x, raw.y, raw.z), _bodyStyle);

            Vector3 smoothed = _orientationManager.Gravity;
            GUILayout.Label(
                string.Format("Smoothed    : ({0,6:F2}, {1,6:F2}, {2,6:F2})", smoothed.x, smoothed.y, smoothed.z),
                _bodyStyle);

            // OS の画面回転はゲームロジックに使っていないことを実機で確認するための参考表示。
            GUILayout.Label("OS Screen.orientation: " + Screen.orientation + "  (unused)", _bodyStyle);
            GUILayout.Space(PanelMarginPixels * 0.5f);
        }

        private void DrawGravitySection()
        {
            if (_gravityManager == null)
            {
                return;
            }

            Vector3 direction = _gravityManager.GravityDirection;
            GUILayout.Label("WORLD GRAVITY", _bodyStyle);
            GUILayout.Label(
                string.Format("Direction: ({0,6:F2}, {1,6:F2}, {2,6:F2})", direction.x, direction.y, direction.z),
                _bodyStyle);
            GUILayout.Space(PanelMarginPixels * 0.5f);
        }

        private void DrawSimulationSection()
        {
            if (!_showSimulationButtons || !_orientationManager.IsSimulated)
            {
                return;
            }

            GUILayout.Label("SIMULATION (sensor unavailable)", _bodyStyle);

            for (int i = 0; i < SelectableStates.Length; i++)
            {
                OrientationState state = SelectableStates[i];
                if (GUILayout.Button(state.ToDisplayName(), _buttonStyle, GUILayout.Height(SimulationButtonHeight * _scale)))
                {
                    _orientationManager.SetSimulatedOrientation(state);
                }
            }
        }

        private void EnsureStyles()
        {
            // 解像度が変わる可能性があるため、毎フレーム基準倍率を求め直す。
            float resolutionScale = Screen.height / ReferenceScreenHeight * _scale;

            if (_titleStyle == null)
            {
                _titleStyle = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold, wordWrap = false };
            }

            if (_bodyStyle == null)
            {
                _bodyStyle = new GUIStyle(GUI.skin.label) { wordWrap = false };
            }

            if (_buttonStyle == null)
            {
                _buttonStyle = new GUIStyle(GUI.skin.button);
            }

            _titleStyle.fontSize = Mathf.Max(1, Mathf.RoundToInt(BaseTitleFontSize * resolutionScale));
            _bodyStyle.fontSize = Mathf.Max(1, Mathf.RoundToInt(BaseBodyFontSize * resolutionScale));
            _buttonStyle.fontSize = _bodyStyle.fontSize;
        }
    }
}
