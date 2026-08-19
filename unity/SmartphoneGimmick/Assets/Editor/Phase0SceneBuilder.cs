using System.Collections.Generic;
using System.IO;
using SmartphoneGimmick.Core;
using SmartphoneGimmick.Diagnostics;
using SmartphoneGimmick.Systems;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SmartphoneGimmick.EditorTools
{
    /// <summary>
    /// Phase 0 の検証シーンをコードから生成する。
    ///
    /// シーンファイルを手作業で組み立てさせず、いつでも同じ状態に作り直せるようにするのが目的。
    /// シーンが壊れた場合もこのメニューを実行すれば復旧できる。
    /// </summary>
    public static class Phase0SceneBuilder
    {
        public const string ScenePath = "Assets/Scenes/Phase0.unity";

        private const string SystemsObjectName = "GameSystems";
        private const float CameraDepth = -10f;

        private static readonly Color BackgroundColor = new Color(0.09f, 0.10f, 0.13f, 1f);

        [MenuItem("Tools/Phase 0/2. Create or Rebuild Phase 0 Scene", false, 11)]
        public static void CreateOrRebuildScene()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())
            {
                return;
            }

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            CreateCamera();
            CreateSystems();

            EnsureDirectory(Path.GetDirectoryName(ScenePath));
            EditorSceneManager.SaveScene(scene, ScenePath);
            RegisterSceneInBuildSettings();

            Debug.Log("[Phase 0] " + ScenePath + " を生成しました。");
        }

        [MenuItem("Tools/Phase 0/3. Setup All (Settings + Scene)", false, 12)]
        public static void SetupAll()
        {
            Phase0ProjectSetup.ApplyRecommendedSettings();
            CreateOrRebuildScene();
        }

        private static void CreateCamera()
        {
            var cameraObject = new GameObject("Main Camera", typeof(Camera));
            cameraObject.tag = "MainCamera";
            cameraObject.transform.position = new Vector3(0f, 0f, CameraDepth);

            Camera camera = cameraObject.GetComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = BackgroundColor;
        }

        /// <summary>
        /// システム類は 1 つの GameObject にまとめる。
        /// 参照が未設定でも SceneComponentLocator が同じ GameObject から解決できるため、
        /// Inspector の手動配線が不要になる。
        /// </summary>
        private static void CreateSystems()
        {
            var systems = new GameObject(SystemsObjectName);
            systems.AddComponent<OrientationManager>();
            systems.AddComponent<GravityManager>();
            systems.AddComponent<OrientationDebugHud>();
        }

        private static void EnsureDirectory(string directory)
        {
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
                AssetDatabase.Refresh();
            }
        }

        private static void RegisterSceneInBuildSettings()
        {
            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            bool alreadyRegistered = scenes.Exists(entry => entry.path == ScenePath);
            if (alreadyRegistered)
            {
                return;
            }

            scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
        }
    }
}
