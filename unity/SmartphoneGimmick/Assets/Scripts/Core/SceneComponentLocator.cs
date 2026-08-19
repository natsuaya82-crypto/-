using UnityEngine;

namespace SmartphoneGimmick.Core
{
    /// <summary>
    /// SerializeField の参照が未設定のときに、同じ GameObject → シーン全体の順で補完するヘルパ。
    ///
    /// Inspector 経由の明示的な参照を第一とし、
    /// セットアップ漏れで NullReferenceException になることだけを防ぐ目的。
    /// Unity のバージョン差 (FindAnyObjectByType の有無) もここに閉じ込める。
    /// </summary>
    public static class SceneComponentLocator
    {
        public static T Resolve<T>(Component owner, T current) where T : Component
        {
            if (current != null)
            {
                return current;
            }

            if (owner != null)
            {
                T onSameObject = owner.GetComponent<T>();
                if (onSameObject != null)
                {
                    return onSameObject;
                }
            }

            return FindInScene<T>();
        }

        private static T FindInScene<T>() where T : Component
        {
#if UNITY_2022_2_OR_NEWER
            return Object.FindAnyObjectByType<T>();
#else
            return Object.FindObjectOfType<T>();
#endif
        }
    }
}
