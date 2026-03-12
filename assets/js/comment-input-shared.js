// @ts-check

(function () {
  if (window.CommentInputShared) return;

  const VALID_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

  function getShared() {
    return window.CommentShared || null;
  }

  function getLoginProfile() {
    const shared = getShared();
    if (shared && typeof shared.getLoginProfile === 'function') {
      return shared.getLoginProfile();
    }
    return {
      nickname: localStorage.getItem('nickname') || '',
      login: '',
      loginType: '',
      isLoggedUser: false,
      avatarType: localStorage.getItem('avatarType') || 'color',
      avatarColor: localStorage.getItem('userColor') || '#4a6cf7',
      avatarUrl: localStorage.getItem('userAvatarUrl') || '',
      uid: ''
    };
  }

  function isValidImageUrl(url) {
    if (!url) return false;
    const lower = String(url).trim().toLowerCase();
    return VALID_IMAGE_EXT.some((ext) => lower.endsWith(ext));
  }

  function normalizeNickname(value) {
    return String(value || '').trim();
  }

  function buildInstance(options) {
    const variant = options.variant || 'lyb';
    const state = {
      nickname: '',
      login: '',
      loginType: '',
      isLoggedUser: false,
      avatarType: 'color',
      avatarColor: '#4a6cf7',
      avatarUrl: '',
      uid: ''
    };

    const elements = {
      nicknameInput: document.getElementById('nickname'),
      avatarPreview: document.getElementById('avatarPreview'),
      colorToggle: document.getElementById(variant === 'lyb' ? 'colorToggle' : 'color-toggle'),
      imageToggle: document.getElementById(variant === 'lyb' ? 'imageToggle' : 'image-toggle'),
      colorPickerContainer: variant === 'lyb' ? document.getElementById('colorPicker') : null,
      colorPickerInput: variant === 'oj' ? document.getElementById('colorPicker') : null,
      avatarUrlInput: document.getElementById('avatarUrl'),
      colorSelector: variant === 'oj' ? document.getElementById('color-selector') : null,
      imageSelector: variant === 'oj' ? document.getElementById('image-selector') : null
    };

    function syncFromProfile() {
      const profile = getLoginProfile();
      state.nickname = profile.nickname || '';
      state.login = profile.login || '';
      state.loginType = profile.loginType || '';
      state.isLoggedUser = Boolean(profile.isLoggedUser);
      state.avatarType = profile.avatarType || state.avatarType;
      state.avatarColor = profile.avatarColor || state.avatarColor;
      state.avatarUrl = profile.avatarUrl || state.avatarUrl;
      state.uid = profile.uid || '';
      if (state.isLoggedUser && !state.nickname) {
        state.nickname = state.login || '已登录';
      }
    }

    function persistLocal() {
      localStorage.setItem('nickname', state.nickname || '');
      localStorage.setItem('avatarType', state.avatarType || 'color');
      localStorage.setItem('userColor', state.avatarColor || '#4a6cf7');
      localStorage.setItem('userAvatarUrl', state.avatarUrl || '');
    }

    function syncProfile() {
      if (state.isLoggedUser) return;
      if (window.QuarkUserProfile && typeof window.QuarkUserProfile.syncProfile === 'function') {
        window.QuarkUserProfile.syncProfile({
          nickname: state.nickname,
          avatarType: state.avatarType,
          avatarColor: state.avatarColor,
          avatarUrl: state.avatarUrl
        });
      }
    }

    function updatePreview() {
      const preview = elements.avatarPreview;
      if (!(preview instanceof HTMLElement)) return;

      if (state.isLoggedUser && state.avatarUrl) {
        preview.style.backgroundImage = `url(${state.avatarUrl})`;
        preview.style.backgroundColor = 'transparent';
        preview.textContent = '';
        return;
      }

      if (state.avatarType === 'color') {
        preview.style.background = state.avatarColor;
        preview.style.backgroundImage = 'none';
        preview.textContent = state.nickname ? state.nickname[0].toUpperCase() : 'A';
        return;
      }

      if (isValidImageUrl(state.avatarUrl)) {
        preview.style.backgroundImage = `url(${state.avatarUrl})`;
        preview.style.backgroundColor = 'transparent';
        preview.textContent = '';
        return;
      }

      preview.style.background = state.avatarColor;
      preview.style.backgroundImage = 'none';
      preview.textContent = state.nickname ? state.nickname[0].toUpperCase() : 'A';
    }

    function disableInputs() {
      if (elements.nicknameInput instanceof HTMLInputElement) {
        elements.nicknameInput.setAttribute('disabled', 'true');
        elements.nicknameInput.value = state.nickname || state.login || '';
      }
      if (elements.avatarUrlInput instanceof HTMLInputElement) {
        elements.avatarUrlInput.setAttribute('disabled', 'true');
      }
      if (elements.colorToggle instanceof HTMLElement) {
        elements.colorToggle.classList.add('disabled');
        elements.colorToggle.style.pointerEvents = 'none';
      }
      if (elements.imageToggle instanceof HTMLElement) {
        elements.imageToggle.classList.add('disabled');
        elements.imageToggle.style.pointerEvents = 'none';
      }
      if (elements.colorSelector instanceof HTMLElement) {
        elements.colorSelector.style.pointerEvents = 'none';
      }
      if (elements.imageSelector instanceof HTMLElement) {
        elements.imageSelector.style.pointerEvents = 'none';
      }
      if (elements.colorPickerInput instanceof HTMLInputElement) {
        elements.colorPickerInput.setAttribute('disabled', 'true');
        elements.colorPickerInput.value = state.avatarColor;
      }
    }

    function selectColorOption(element) {
      if (!element || !(element instanceof HTMLElement)) return;
      if (!elements.colorPickerContainer) return;
      elements.colorPickerContainer.querySelectorAll('.color-option').forEach((opt) => {
        opt.classList.remove('selected');
      });
      element.classList.add('selected');
      const bg = element.style.backgroundColor || element.style.background;
      if (bg) {
        state.avatarColor = bg;
        state.avatarType = 'color';
        refreshFromInputs();
      }
    }

    function setAvatarType(type) {
      state.avatarType = type;
      if (elements.colorToggle && elements.imageToggle) {
        elements.colorToggle.classList.toggle('active', type === 'color');
        elements.imageToggle.classList.toggle('active', type === 'image');
      }
      if (elements.colorSelector && elements.imageSelector) {
        elements.colorSelector.classList.toggle('active', type === 'color');
        elements.imageSelector.classList.toggle('active', type === 'image');
      }
      if (variant === 'lyb') {
        if (elements.colorPickerContainer instanceof HTMLElement) {
          elements.colorPickerContainer.style.display = type === 'color' ? 'flex' : 'none';
        }
        if (elements.avatarUrlInput instanceof HTMLInputElement) {
          elements.avatarUrlInput.style.display = type === 'image' ? 'block' : 'none';
        }
      }
    }

    function refreshFromInputs() {
      if (state.isLoggedUser) {
        updatePreview();
        return;
      }
      if (elements.nicknameInput instanceof HTMLInputElement) {
        state.nickname = normalizeNickname(elements.nicknameInput.value);
      }
      if (elements.avatarUrlInput instanceof HTMLInputElement) {
        state.avatarUrl = elements.avatarUrlInput.value.trim();
      }
      if (elements.colorPickerInput instanceof HTMLInputElement) {
        state.avatarColor = elements.colorPickerInput.value || state.avatarColor;
      }
      persistLocal();
      syncProfile();
      updatePreview();
    }

    function initInputs() {
      syncFromProfile();

      if (elements.nicknameInput instanceof HTMLInputElement) {
        elements.nicknameInput.value = state.nickname || state.login || '';
      }
      if (elements.avatarUrlInput instanceof HTMLInputElement && state.avatarUrl) {
        elements.avatarUrlInput.value = state.avatarUrl;
      }
      if (elements.colorPickerInput instanceof HTMLInputElement) {
        elements.colorPickerInput.value = state.avatarColor;
      }

      if (state.isLoggedUser) {
        disableInputs();
        updatePreview();
        return;
      }

      if (elements.nicknameInput instanceof HTMLInputElement) {
        elements.nicknameInput.addEventListener('input', () => {
          refreshFromInputs();
        });
      }

      if (elements.colorToggle instanceof HTMLElement) {
        elements.colorToggle.addEventListener('click', () => {
          setAvatarType('color');
          refreshFromInputs();
        });
      }
      if (elements.imageToggle instanceof HTMLElement) {
        elements.imageToggle.addEventListener('click', () => {
          setAvatarType('image');
          refreshFromInputs();
        });
      }

      if (elements.colorPickerInput instanceof HTMLInputElement) {
        elements.colorPickerInput.addEventListener('input', () => {
          setAvatarType('color');
          refreshFromInputs();
        });
      }

      if (elements.avatarUrlInput instanceof HTMLInputElement) {
        elements.avatarUrlInput.addEventListener('input', () => {
          setAvatarType('image');
          refreshFromInputs();
        });
      }

      setAvatarType(state.avatarType || 'color');
      updatePreview();
    }

    initInputs();

    return {
      getState: () => ({ ...state }),
      refreshFromInputs,
      updatePreview,
      selectColorOption,
      setAvatarType
    };
  }

  window.CommentInputShared = {
    init(options) {
      const instance = buildInstance(options || {});
      window.__commentInputSharedInstance = instance;
      return instance;
    }
  };

  window.selectColor = function (element) {
    const instance = window.__commentInputSharedInstance;
    if (instance && typeof instance.selectColorOption === 'function') {
      instance.selectColorOption(element);
    }
  };
})();
