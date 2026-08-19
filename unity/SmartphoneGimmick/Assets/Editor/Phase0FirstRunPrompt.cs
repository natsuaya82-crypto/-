using System.IO;
using UnityEditor;
using UnityEngine;

namespace SmartphoneGimmick.EditorTools
{
    /// <summary>
    /// Phase 0 のシーンがまだ無い状態でプロジェクトを開いたとき、
    /// セットアップを実行するか一度だけ確認する。
    ///
    /// Unity の操作に慣れていなくても、初回起動から実行までたどり着けるようにするための補助。
    /// 「あとで」を選べば以降は表示しない。
    /// </summary>
    [InitializeOnLoad]
    internal static class Phase0FirstRunPrompt
    {
        private const string SkipKeyPrefix = "SmartphoneGimmick.Phase0.SkipFirstRunPrompt.";
        private const string DialogTitle = "Phase 0 セットアップ";

        private const string DialogMessage =
            "Phase 0 の検証シーンがまだありません。\n\n" +
            "Project Settings の適用と Phase0 シーンの生成を今すぐ実行しますか?\n" +
            "(あとから Tools > Phase 0 メニューでも実行できます)";

        static Phase0FirstRunPrompt()
        {
            EditorApplication.delayCall += ShowPromptIfNeeded;
        }

        private static void ShowPromptIfNeeded()
        {
            // batch mode (CI) ではダイアログを出せない。ここで止めないとビルドが応答しなくなる。
            if (Application.isBatchMode || EditorApplication.isPlayingOrWillChangePlaymode)
            {
                return;
            }

            string skipKey = SkipKeyPrefix + PlayerSettings.productGUID.ToString();
            if (EditorPrefs.GetBool(skipKey, false))
            {
                return;
            }

            if (File.Exists(Phase0SceneBuilder.ScenePath))
            {
                return;
            }

            bool runSetup = EditorUtility.DisplayDialog(DialogTitle, DialogMessage, "実行する", "あとで");
            EditorPrefs.SetBool(skipKey, true);

            if (runSetup)
            {
                Phase0SceneBuilder.SetupAll();
            }
        }
    }
}
