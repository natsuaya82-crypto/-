using System.Text;
using SmartphoneGimmick.Core;
using UnityEditor;
using UnityEngine;

namespace SmartphoneGimmick.EditorTools
{
    /// <summary>
    /// OrientationMath の変換が正しいかを Editor 上で確認するためのセルフテスト。
    ///
    /// Test Framework パッケージを前提にしたくないので、メニュー実行 + Console 出力の形にしている。
    /// センサー実機値に依存しない純粋な計算部分だけを対象とする。
    /// </summary>
    public static class Phase0SelfTest
    {
        private const float AngleTolerance = 0.01f;
        private const float SampleStepDegrees = 0.25f;

        private static readonly OrientationState[] AllStates =
        {
            OrientationState.Portrait,
            OrientationState.LandscapeLeft,
            OrientationState.PortraitUpsideDown,
            OrientationState.LandscapeRight,
        };

        [MenuItem("Tools/Phase 0/4. Run Orientation Self Test", false, 13)]
        public static void Run()
        {
            var report = new StringBuilder();
            int failures = 0;

            failures += VerifyRoundTrip(report);
            failures += VerifyPhysicalCases(report);
            failures += VerifyFullCircleCoverage(report);

            if (failures == 0)
            {
                Debug.Log("[Phase 0] Orientation Self Test: PASS\n" + report);
                return;
            }

            Debug.LogError("[Phase 0] Orientation Self Test: " + failures + " 件失敗\n" + report);
        }

        /// <summary>state → 重力ベクトル → ロール角 → state が元に戻ることを確認する。</summary>
        private static int VerifyRoundTrip(StringBuilder report)
        {
            int failures = 0;
            report.AppendLine("[round trip] state -> gravity -> roll -> state");

            foreach (OrientationState state in AllStates)
            {
                Vector3 gravity = OrientationMath.StateToGravity(state);
                float roll = OrientationMath.GravityToRollDegrees(gravity);
                OrientationState restored = OrientationMath.RollToNearestState(roll);

                bool angleMatches = Mathf.Abs(Mathf.DeltaAngle(roll, OrientationMath.StateToRollDegrees(state))) < AngleTolerance;
                bool passed = restored == state && angleMatches;
                failures += passed ? 0 : 1;

                report.AppendFormat(
                    "  {0,-20} gravity=({1,5:F2},{2,5:F2}) roll={3,7:F1} -> {4,-20} {5}\n",
                    state, gravity.x, gravity.y, roll, restored, passed ? "OK" : "FAIL");
            }

            return failures;
        }

        /// <summary>実機で意図する物理的な持ち方と結果の対応を確認する。</summary>
        private static int VerifyPhysicalCases(StringBuilder report)
        {
            int failures = 0;
            report.AppendLine("[physical] gravity -> state");

            failures += CheckCase(report, Vector3.down, OrientationState.Portrait, "立てて持つ");
            failures += CheckCase(report, Vector3.up, OrientationState.PortraitUpsideDown, "上下逆");
            failures += CheckCase(report, Vector3.left, OrientationState.LandscapeLeft, "反時計回りに90度");
            failures += CheckCase(report, Vector3.right, OrientationState.LandscapeRight, "時計回りに90度");

            return failures;
        }

        private static int CheckCase(StringBuilder report, Vector3 gravity, OrientationState expected, string note)
        {
            OrientationState actual = OrientationMath.RollToNearestState(OrientationMath.GravityToRollDegrees(gravity));
            bool passed = actual == expected;

            report.AppendFormat(
                "  ({0,5:F2},{1,5:F2},{2,5:F2}) -> {3,-20} expected {4,-20} {5}  // {6}\n",
                gravity.x, gravity.y, gravity.z, actual, expected, passed ? "OK" : "FAIL", note);

            return passed ? 0 : 1;
        }

        /// <summary>全周のどの角度でも Unknown にならず、いずれかの姿勢に分類されることを確認する。</summary>
        private static int VerifyFullCircleCoverage(StringBuilder report)
        {
            int failures = 0;

            for (float roll = -180f; roll < 180f; roll += SampleStepDegrees)
            {
                if (OrientationMath.RollToNearestState(roll) != OrientationState.Unknown)
                {
                    continue;
                }

                failures++;
                report.AppendFormat("[coverage] roll={0:F2} が Unknown に分類されました\n", roll);
            }

            report.AppendLine("[coverage] 全周 360 度の分類: " + (failures == 0 ? "OK" : "FAIL"));
            return failures;
        }
    }
}
