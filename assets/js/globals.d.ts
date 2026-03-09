interface FirebaseConfig {
  projectId: string;
  [key: string]: unknown;
}

interface Window {
  firebase?: any;
  firebaseConfig?: FirebaseConfig;
  _firebaseConfig?: FirebaseConfig;
  __firebaseConfigLoaded?: (config: FirebaseConfig) => void;
  cityBanterData?: Record<string, string> | null;
  __HOME_PRELOADED__?: unknown;
  __DT_PRELOADED__?: unknown;
  __DT_DETAIL__?: unknown;
  __NAV_CONFIG__?: unknown;
  __POPUPS_DATA__?: unknown;
  __dynamicInteractionsInited?: boolean;
  visitorInfoDisplayed?: boolean;
  cachedVisitorInfo?: unknown;
  initPostAnnotations?: () => void;
  __postAnnotationsInitFlag?: boolean;
  renderMathInElement?: (
    element: Element,
    options: {
      delimiters: Array<{ left: string; right: string; display: boolean }>;
      throwOnError?: boolean;
    }
  ) => void;
}

declare const firebase: any;
declare const firebaseConfig: FirebaseConfig;

declare const marked: {
  setOptions: (options: { breaks?: boolean; gfm?: boolean }) => void;
  parse: (text: string) => string;
};

declare class QQEmotionParser {
  parse(text: string): string;
}

declare function checkAndShowPopup(): void;
