#if UNITY_IOS
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Callbacks;
using UnityEditor.iOS.Xcode;
using UnityEngine;

namespace SmartphoneGimmick.EditorTools
{
    /// <summary>
    /// Unity が生成した Xcode プロジェクトに、署名設定と Info.plist の追記を行う。
    ///
    /// なぜ pbxproj 側に書くのか:
    ///   xcodebuild のコマンドラインに署名パラメータを渡すと、アプリ本体だけでなく
    ///   UnityFramework ターゲットにも同じ設定が波及する。フレームワークは
    ///   Provisioning Profile を持てないため
    ///   "does not support provisioning profiles" で archive が落ちる。
    ///   ターゲットごとに設定を分けられるのは pbxproj 側だけなので、ここで書き込む。
    /// </summary>
    public static class IosPostProcessBuild
    {
        private const string DistributionSigningIdentity = "Apple Distribution";
        private const string ManualSigningStyle = "Manual";

        // TestFlight 配信時の輸出コンプライアンス質問を毎回手動で答えずに済ませる。
        // 独自の暗号化を使っていないので false で正しい。
        private const string EncryptionPlistKey = "ITSAppUsesNonExemptEncryption";

        [PostProcessBuild(999)]
        public static void OnPostProcessBuild(BuildTarget target, string pathToBuiltProject)
        {
            if (target != BuildTarget.iOS)
            {
                return;
            }

            ApplySigningSettings(pathToBuiltProject);
            ApplyInfoPlistSettings(pathToBuiltProject);
        }

        private static void ApplySigningSettings(string pathToBuiltProject)
        {
            string teamId = ReadEnvironment("APPLE_TEAM_ID");
            string profileName = ReadEnvironment("IOS_PROVISIONING_PROFILE_NAME");

            if (string.IsNullOrEmpty(teamId) || string.IsNullOrEmpty(profileName))
            {
                Debug.Log("[CI] APPLE_TEAM_ID / IOS_PROVISIONING_PROFILE_NAME が未設定のため署名設定を書き込みません。");
                return;
            }

            string projectPath = PBXProject.GetPBXProjectPath(pathToBuiltProject);
            var project = new PBXProject();
            project.ReadFromFile(projectPath);

            string appTarget = project.GetUnityMainTargetGuid();
            string frameworkTarget = project.GetUnityFrameworkTargetGuid();

            // アプリ本体: Provisioning Profile を名前で指定する。
            project.SetBuildProperty(appTarget, "CODE_SIGN_STYLE", ManualSigningStyle);
            project.SetBuildProperty(appTarget, "DEVELOPMENT_TEAM", teamId);
            project.SetBuildProperty(appTarget, "PROVISIONING_PROFILE_SPECIFIER", profileName);
            project.SetBuildProperty(appTarget, "CODE_SIGN_IDENTITY", DistributionSigningIdentity);

            // UnityFramework: 証明書だけで署名し、Provisioning Profile は割り当てない。
            project.SetBuildProperty(frameworkTarget, "CODE_SIGN_STYLE", ManualSigningStyle);
            project.SetBuildProperty(frameworkTarget, "DEVELOPMENT_TEAM", teamId);
            project.SetBuildProperty(frameworkTarget, "PROVISIONING_PROFILE_SPECIFIER", string.Empty);
            project.SetBuildProperty(frameworkTarget, "CODE_SIGN_IDENTITY", DistributionSigningIdentity);

            project.WriteToFile(projectPath);
            Debug.Log("[CI] 署名設定を pbxproj に書き込みました。profile=" + profileName + " / team=" + teamId);
        }

        private static void ApplyInfoPlistSettings(string pathToBuiltProject)
        {
            string plistPath = Path.Combine(pathToBuiltProject, "Info.plist");
            if (!File.Exists(plistPath))
            {
                Debug.LogWarning("[CI] Info.plist が見つかりません: " + plistPath);
                return;
            }

            var plist = new PlistDocument();
            plist.ReadFromFile(plistPath);
            plist.root.SetBoolean(EncryptionPlistKey, false);
            plist.WriteToFile(plistPath);
        }

        private static string ReadEnvironment(string key)
        {
            return Environment.GetEnvironmentVariable(key);
        }
    }
}
#endif
