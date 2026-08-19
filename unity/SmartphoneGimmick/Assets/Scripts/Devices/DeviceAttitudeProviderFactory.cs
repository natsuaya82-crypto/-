using SmartphoneGimmick.Core;

namespace SmartphoneGimmick.Devices
{
    /// <summary>
    /// 実行環境に応じて適切な IDeviceAttitudeProvider を選ぶ。
    ///
    /// プラットフォーム分岐をここ 1 箇所に閉じ込めることで、
    /// OrientationManager 側にプラットフォーム依存コードを持ち込まない。
    /// </summary>
    public static class DeviceAttitudeProviderFactory
    {
        /// <summary>
        /// 指定モードに従って Provider を生成する。生成しただけでは有効化されない (Enable は呼び出し側)。
        /// </summary>
        /// <param name="mode">取得元の指定。</param>
        /// <param name="allowSimulationFallback">
        /// Automatic 指定で実機センサーが使えなかった場合に、シミュレーションへ落とすかどうか。
        /// </param>
        public static IDeviceAttitudeProvider Create(AttitudeSourceMode mode, bool allowSimulationFallback)
        {
            if (mode == AttitudeSourceMode.Simulated)
            {
                return new SimulatedAttitudeProvider();
            }

            IDeviceAttitudeProvider sensorProvider = CreateSensorProvider();
            if (sensorProvider != null)
            {
                return sensorProvider;
            }

            if (mode == AttitudeSourceMode.Automatic && allowSimulationFallback)
            {
                return new SimulatedAttitudeProvider();
            }

            return null;
        }

        /// <summary>使用可能な実機センサー実装を返す。無ければ null。</summary>
        private static IDeviceAttitudeProvider CreateSensorProvider()
        {
#if ENABLE_INPUT_SYSTEM
            var inputSystemProvider = new InputSystemAttitudeProvider();
            if (inputSystemProvider.IsAvailable)
            {
                return inputSystemProvider;
            }
#endif

#if ENABLE_LEGACY_INPUT_MANAGER
            var legacyProvider = new LegacyInputAttitudeProvider();
            if (legacyProvider.IsAvailable)
            {
                return legacyProvider;
            }
#endif

            return null;
        }
    }
}
