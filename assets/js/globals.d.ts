/* ── Firebase ── */
interface FirebaseConfig {
  projectId: string;
  [key: string]: unknown;
}

/* ── Window extensions ── */
interface Window {
  firebase?: any;
  firebaseConfig?: FirebaseConfig;
  _firebaseConfig?: FirebaseConfig;
  __firebaseConfigLoaded?: (config: FirebaseConfig) => void;
  cityBanterData?: Record<string, string> | null;

  /* Preloaded page data */
  __HOME_PRELOADED__?: any;
  __DT_PRELOADED__?: any;
  __DT_DETAIL__?: any;
  __NAV_CONFIG__?: any;
  __POPUPS_DATA__?: any;
  __NAV_HOVER_DATA__?: any;
  __FULLTEXT_INDEX__?: any;

  /* Feature flags */
  __dynamicInteractionsInited?: boolean;
  __postAnnotationsInitFlag?: boolean;
  visitorInfoDisplayed?: boolean;
  cachedVisitorInfo?: any;

  /* Navigation / UI */
  renderNavUserProfile?: () => void;
  searchBlog?: (query: string) => void;
  initPostAnnotations?: () => void;
  checkAndShowPopup?: () => void;

  /* Comment system */
  CommentShared?: Record<string, any>;
  CommentRenderShared?: Record<string, any>;

  /* Dynamic gallery */
  DynamicGallery?: any;

  /* User system */
  QuarkUserPreferences?: any;
  QuarkUserProfile?: Record<string, any>;

  /* Firebase ready promise with methods */
  QuarkFirebaseReady?: Promise<any> & {
    ensureDatabase?: () => any;
    loadConfigScript?: () => any;
    getConfig?: () => any;
    waitForConfig?: () => any;
  };

  /* KaTeX */
  renderMathInElement?: (
    element: Element,
    options: {
      delimiters: Array<{ left: string; right: string; display: boolean }>;
      throwOnError?: boolean;
    }
  ) => void;

  /* In-page globals accessed via window.marked */
  marked?: typeof marked;
  QQEmotionParser?: typeof QQEmotionParser;
}

/* ── Global script declarations ── */
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

/* CSS.escape polyfill for older browsers */
declare namespace CSS {
  function escape(value: string): string;
}

/* Utility function used in nav.js for transform */
declare function translate(x: number, y: number): string;
