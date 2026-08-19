using UnityEngine;

namespace SmartphoneGimmick.Core
{
    /// <summary>
    /// 重力ベクトル ⇔ 回転角 ⇔ OrientationState の変換を担当する純粋な計算ユーティリティ。
    ///
    /// MonoBehaviour に計算を書かないことで、
    ///  - 判定ロジックを単体で検証できる
    ///  - 将来 GravitySystem / WorldRotationSystem から同じ式を再利用できる
    /// ようにしている。
    /// </summary>
    public static class OrientationMath
    {
        /// <summary>4 分割された各姿勢セクターの半角。90 度 / 2。</summary>
        public const float SectorHalfAngleDegrees = 45f;

        /// <summary>1 周の角度。</summary>
        public const float FullTurnDegrees = 360f;

        /// <summary>重力ベクトルとして有効とみなす最小の長さの 2 乗。ノイズ・未初期化値の除外用。</summary>
        public const float MinValidGravitySqrMagnitude = 0.01f;

        /// <summary>Portrait を 0 度としたときの各姿勢の基準角。</summary>
        public const float PortraitRollDegrees = 0f;
        public const float LandscapeLeftRollDegrees = 90f;
        public const float PortraitUpsideDownRollDegrees = 180f;
        public const float LandscapeRightRollDegrees = -90f;

        /// <summary>
        /// 端末ローカルの重力ベクトルから、画面平面上の回転角 (ロール角) を求める。
        /// Portrait (0, -1, 0) が 0 度、反時計回りが正。
        /// </summary>
        public static float GravityToRollDegrees(Vector3 gravity)
        {
            return Mathf.Atan2(-gravity.x, -gravity.y) * Mathf.Rad2Deg;
        }

        /// <summary>
        /// ロール角から、画面平面上の「下」方向 (＝重力の向き) を求める。
        /// GravityToRollDegrees の逆変換。
        /// </summary>
        public static Vector3 RollToDownDirection(float rollDegrees)
        {
            return Quaternion.AngleAxis(-rollDegrees, Vector3.forward) * Vector3.down;
        }

        /// <summary>その姿勢を代表する基準ロール角。</summary>
        public static float StateToRollDegrees(OrientationState state)
        {
            switch (state)
            {
                case OrientationState.LandscapeLeft: return LandscapeLeftRollDegrees;
                case OrientationState.PortraitUpsideDown: return PortraitUpsideDownRollDegrees;
                case OrientationState.LandscapeRight: return LandscapeRightRollDegrees;
                default: return PortraitRollDegrees;
            }
        }

        /// <summary>その姿勢のときの端末ローカル重力ベクトル (シミュレーション用)。</summary>
        public static Vector3 StateToGravity(OrientationState state)
        {
            return RollToDownDirection(StateToRollDegrees(state));
        }

        /// <summary>ロール角に最も近い姿勢を返す。ヒステリシスは含まない (呼び出し側の責務)。</summary>
        public static OrientationState RollToNearestState(float rollDegrees)
        {
            float roll = Mathf.DeltaAngle(0f, rollDegrees);

            if (roll >= -SectorHalfAngleDegrees && roll < SectorHalfAngleDegrees)
            {
                return OrientationState.Portrait;
            }

            if (roll >= SectorHalfAngleDegrees && roll < SectorHalfAngleDegrees * 3f)
            {
                return OrientationState.LandscapeLeft;
            }

            if (roll <= -SectorHalfAngleDegrees && roll > -SectorHalfAngleDegrees * 3f)
            {
                return OrientationState.LandscapeRight;
            }

            return OrientationState.PortraitUpsideDown;
        }

        /// <summary>現在のロール角が、指定姿勢の基準角からどれだけ離れているか (絶対値・度)。</summary>
        public static float AngleDistanceToState(float rollDegrees, OrientationState state)
        {
            return Mathf.Abs(Mathf.DeltaAngle(rollDegrees, StateToRollDegrees(state)));
        }

        /// <summary>
        /// フレームレートに依存しない指数平滑の補間率を求める。
        /// halfLifeSeconds が 0 以下なら平滑化しない (1 を返す)。
        /// </summary>
        public static float SmoothingFactor(float halfLifeSeconds, float deltaTime)
        {
            if (halfLifeSeconds <= 0f || deltaTime <= 0f)
            {
                return 1f;
            }

            return 1f - Mathf.Exp(-deltaTime * Mathf.Log(2f) / halfLifeSeconds);
        }
    }
}
