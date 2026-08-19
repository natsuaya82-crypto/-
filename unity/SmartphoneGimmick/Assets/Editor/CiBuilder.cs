using System;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace SmartphoneGimmick.EditorTools
{
    /// <summary>
    /// GitHub Actions (batch mode) から呼ばれる iOS ビルドの入口。
    ///
    /// Mac が無い前提なので、Editor を手で操作して行う作業をすべてここに寄せる:
    ///   Project Settings の適用 → シーン生成 → 署名情報の設定 → Xcode プロジェクト出力
    ///
    /// 実際の署名設定の書き込みは IosPostProcessBuild が行う。
    /// (xcodebuild のコマンドラインに署名を渡すと UnityFramework ターゲットにも波及して
    ///  archive が失敗するため、pbxproj 側に持たせる方針)
    /// </summary>
    public static class CiBuilder
    {
        private const string CustomBuildPathArgument = "-customBuildPath";
        private const string DefaultOutputPath = "build/iOS";
        private const string DefaultBundleIdentifier = "com.tokinets.gimmick";
        private const string DefaultBuildNumber = "1";
        private const string BundleVersion = "0.1.0";

        /// <summary>GameCI の buildMethod として指定するエントリポイント。</summary>
        public static void BuildIos()
        {
            try
            {
                string outputPath = ResolveOutputPath();
                ConfigurePlayerSettings();

                Phase0ProjectSetup.ApplyRecommendedSettings();
                Phase0SceneBuilder.CreateSceneWithoutPrompt();

                Debug.Log("[CI] iOS ビルドを開始します。出力先: " + outputPath);
                BuildReport report = BuildPipeline.BuildPlayer(CreateBuildOptions(outputPath));
                ReportAndExit(report);
            }
            catch (Exception exception)
            {
                Debug.LogError("[CI] ビルド中に例外が発生しました: " + exception);
                EditorApplication.Exit(1);
            }
        }

        private static void ConfigurePlayerSettings()
        {
            string bundleIdentifier = ReadEnvironment("IOS_BUNDLE_ID", DefaultBundleIdentifier);
            string teamId = ReadEnvironment("APPLE_TEAM_ID", string.Empty);
            string buildNumber = ReadEnvironment("IOS_BUILD_NUMBER", DefaultBuildNumber);

            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, bundleIdentifier);
            PlayerSettings.bundleVersion = BundleVersion;
            PlayerSettings.iOS.buildNumber = buildNumber;

            // 署名はワークフローが用意した証明書とプロファイルで行うため、自動署名は使わない。
            PlayerSettings.iOS.appleEnableAutomaticSigning = false;
            PlayerSettings.iOS.appleDeveloperTeamID = teamId;

            Debug.Log(string.Format(
                "[CI] bundleId={0} / version={1} / build={2} / team={3}",
                bundleIdentifier, BundleVersion, buildNumber, string.IsNullOrEmpty(teamId) ? "(未設定)" : teamId));
        }

        private static BuildPlayerOptions CreateBuildOptions(string outputPath)
        {
            return new BuildPlayerOptions
            {
                scenes = new[] { Phase0SceneBuilder.ScenePath },
                target = BuildTarget.iOS,
                targetGroup = BuildTargetGroup.iOS,
                locationPathName = outputPath,
                options = BuildOptions.None,
            };
        }

        /// <summary>
        /// 出力先を決める。GameCI が渡す -customBuildPath を最優先し、
        /// 手元での動作確認時は既定パスにフォールバックする。
        /// </summary>
        private static string ResolveOutputPath()
        {
            string fromArgument = ReadCommandLineArgument(CustomBuildPathArgument);
            if (!string.IsNullOrEmpty(fromArgument))
            {
                return fromArgument;
            }

            return ReadEnvironment("IOS_BUILD_OUTPUT", DefaultOutputPath);
        }

        private static void ReportAndExit(BuildReport report)
        {
            BuildSummary summary = report.summary;
            Debug.Log(string.Format(
                "[CI] 結果={0} / サイズ={1} bytes / 時間={2}",
                summary.result, summary.totalSize, summary.totalTime));

            if (summary.result == BuildResult.Succeeded)
            {
                EditorApplication.Exit(0);
                return;
            }

            Debug.LogError("[CI] ビルドに失敗しました。エラー数: " + summary.totalErrors);
            EditorApplication.Exit(1);
        }

        private static string ReadEnvironment(string key, string fallback)
        {
            string value = Environment.GetEnvironmentVariable(key);
            return string.IsNullOrEmpty(value) ? fallback : value;
        }

        private static string ReadCommandLineArgument(string name)
        {
            string[] arguments = Environment.GetCommandLineArgs();
            for (int i = 0; i < arguments.Length - 1; i++)
            {
                if (arguments[i] == name)
                {
                    return arguments[i + 1];
                }
            }

            return null;
        }
    }
}
