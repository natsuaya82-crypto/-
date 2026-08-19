using UnityEditor;
using UnityEngine;

namespace SmartphoneGimmick.EditorTools
{
    /// <summary>
    /// Phase 0 に必要な Project Settings をコードから適用する。
    ///
    /// Inspector を手作業でたどらせず、メニュー 1 回で再現できるようにするのが目的。
    /// 何を変えたかがこのファイルを読めば分かる状態を維持する。
    /// </summary>
    public static class Phase0ProjectSetup
    {
        private const string DefaultCompanyName = "SmartphoneGimmick";
        private const string DefaultProductName = "Smartphone Gimmick";
        private const string DefaultBundleIdentifier = "com.example.smartphonegimmick";
        private const string MinimumIOSVersion = "13.0";

        [MenuItem("Tools/Phase 0/1. Apply Recommended Project Settings", false, 10)]
        public static void ApplyRecommendedSettings()
        {
            ApplyCommonSettings();
            ApplyIOSSettings();

            AssetDatabase.SaveAssets();
            Debug.Log("[Phase 0] Project Settings を適用しました。iOS ビルドには Signing Team ID の設定が別途必要です。");
        }

        private static void ApplyCommonSettings()
        {
            if (PlayerSettings.companyName == "DefaultCompany" || string.IsNullOrEmpty(PlayerSettings.companyName))
            {
                PlayerSettings.companyName = DefaultCompanyName;
            }

            PlayerSettings.productName = DefaultProductName;

            // 端末姿勢はセンサーから自前で判定するため、アプリ自体は Portrait に固定する。
            // OS の自動回転で画面が回ると、ゲーム世界の回転と二重にかかってしまう。
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = false;
            PlayerSettings.allowedAutorotateToLandscapeRight = false;
            PlayerSettings.useAnimatedAutorotation = false;

            PlayerSettings.statusBarHidden = true;
        }

        private static void ApplyIOSSettings()
        {
            PlayerSettings.iOS.targetOSVersionString = MinimumIOSVersion;
            PlayerSettings.iOS.targetDevice = iOSTargetDevice.iPhoneAndiPad;
            PlayerSettings.iOS.requiresFullScreen = true;
            PlayerSettings.iOS.appleEnableAutomaticSigning = true;

            SetBundleIdentifierIfUnset();
            SetIOSScriptingBackend();
        }

        private static void SetBundleIdentifierIfUnset()
        {
#if UNITY_2021_2_OR_NEWER
            string current = PlayerSettings.GetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.iOS);
#else
            string current = PlayerSettings.GetApplicationIdentifier(BuildTargetGroup.iOS);
#endif
            if (!string.IsNullOrEmpty(current) && !current.StartsWith("com.DefaultCompany"))
            {
                return;
            }

#if UNITY_2021_2_OR_NEWER
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.iOS, DefaultBundleIdentifier);
#else
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.iOS, DefaultBundleIdentifier);
#endif
        }

        private static void SetIOSScriptingBackend()
        {
            // iOS は IL2CPP 必須。明示しておくことで環境差による事故を防ぐ。
#if UNITY_2021_2_OR_NEWER
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.iOS, ScriptingImplementation.IL2CPP);
#else
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.iOS, ScriptingImplementation.IL2CPP);
#endif
        }
    }
}
