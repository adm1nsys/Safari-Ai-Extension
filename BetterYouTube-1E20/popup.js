const DEFAULTS = {
  premiumEnabled: false,
  regionCode: '',

  colorMode: 'solid',
  solidColor: '#ff0033',
  gradientColor1: '#ff0033',
  gradientColor2: '#ff7a00',
  gradientAngle: 135,
  gradientAnimate: false,
  gradientSpeed: 3,
  customFill: '',
  customSvgCode: '',

  dislikesEnabled: false,

  searchPlaceholder: '',

  headerGlassEnabled: false,
  headerBlur: 12,
  headerColorLight: '#ffffff',
  headerColorDark: '#0f0f0f',
  headerOpacity: 0.6,
  headerMargin: 10,
  headerRadius: 16,
};

function logError(error) {
  console.error('Failed to save setting: ' + error);
}

function bindCheckbox(el, key) {
  el.addEventListener('change', () => {
    browser.storage.local.set({ [key]: el.checked }).catch(logError);
  });
}

function bindText(el, key, parse = (value) => value) {
  el.addEventListener('input', () => {
    browser.storage.local.set({ [key]: parse(el.value) }).catch(logError);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const premiumToggle = document.getElementById('premiumToggle');
    const regionInput = document.getElementById('regionCode');

    const modeSolid = document.getElementById('modeSolid');
    const modeGradient = document.getElementById('modeGradient');
    const modeCustom = document.getElementById('modeCustom');
    const solidColorsRow = document.getElementById('solidColors');
    const gradientColorsRow = document.getElementById('gradientColors');
    const gradientColors2Row = document.getElementById('gradientColors2');
    const customColorsRow = document.getElementById('customColors');
    const solidColorInput = document.getElementById('solidColor');
    const gradientColor1Input = document.getElementById('gradientColor1');
    const gradientColor2Input = document.getElementById('gradientColor2');
    const gradientAngleInput = document.getElementById('gradientAngle');
    const gradientAnimateInput = document.getElementById('gradientAnimate');
    const gradientSpeedInput = document.getElementById('gradientSpeed');
    const customFillInput = document.getElementById('customFill');
    const customSvgCodeInput = document.getElementById('customSvgCode');

    const dislikesToggle = document.getElementById('dislikesToggle');
    const searchPlaceholderInput = document.getElementById('searchPlaceholder');

    const headerGlassToggle = document.getElementById('headerGlassToggle');
    const headerColorsRow = document.getElementById('headerColors');
    const headerShapeRow = document.getElementById('headerShape');
    const headerColorLightInput = document.getElementById('headerColorLight');
    const headerColorDarkInput = document.getElementById('headerColorDark');
    const headerBlurInput = document.getElementById('headerBlur');
    const headerOpacityInput = document.getElementById('headerOpacity');
    const headerMarginInput = document.getElementById('headerMargin');
    const headerRadiusInput = document.getElementById('headerRadius');

    const settings = await browser.storage.local.get(DEFAULTS);

    premiumToggle.checked = settings.premiumEnabled;
    regionInput.value = settings.regionCode;

    solidColorInput.value = settings.solidColor;
    gradientColor1Input.value = settings.gradientColor1;
    gradientColor2Input.value = settings.gradientColor2;
    gradientAngleInput.value = settings.gradientAngle;
    gradientAnimateInput.checked = settings.gradientAnimate;
    gradientSpeedInput.value = settings.gradientSpeed;
    gradientAngleInput.disabled = settings.gradientAnimate;
    customFillInput.value = settings.customFill;
    customSvgCodeInput.value = settings.customSvgCode;

    dislikesToggle.checked = settings.dislikesEnabled;
    searchPlaceholderInput.value = settings.searchPlaceholder;

    headerGlassToggle.checked = settings.headerGlassEnabled;
    headerColorLightInput.value = settings.headerColorLight;
    headerColorDarkInput.value = settings.headerColorDark;
    headerBlurInput.value = settings.headerBlur;
    headerOpacityInput.value = settings.headerOpacity;
    headerMarginInput.value = settings.headerMargin;
    headerRadiusInput.value = settings.headerRadius;

    const setColorMode = (mode) => {
      modeSolid.checked = mode === 'solid';
      modeGradient.checked = mode === 'gradient';
      modeCustom.checked = mode === 'custom';
      solidColorsRow.hidden = mode !== 'solid';
      gradientColorsRow.hidden = mode !== 'gradient';
      gradientColors2Row.hidden = mode !== 'gradient';
      customColorsRow.hidden = mode !== 'custom';
    };
    setColorMode(settings.colorMode);

    const setHeaderRowVisibility = (enabled) => {
      headerColorsRow.hidden = !enabled;
      headerShapeRow.hidden = !enabled;
    };
    setHeaderRowVisibility(settings.headerGlassEnabled);

    bindCheckbox(premiumToggle, 'premiumEnabled');
    bindText(regionInput, 'regionCode');

    for (const radio of [modeSolid, modeGradient, modeCustom]) {
      radio.addEventListener('change', () => {
        const mode = modeGradient.checked ? 'gradient' : modeCustom.checked ? 'custom' : 'solid';
        setColorMode(mode);
        browser.storage.local.set({ colorMode: mode }).catch(logError);
      });
    }

    bindText(solidColorInput, 'solidColor');
    bindText(gradientColor1Input, 'gradientColor1');
    bindText(gradientColor2Input, 'gradientColor2');
    bindText(gradientAngleInput, 'gradientAngle', Number);
    bindText(gradientSpeedInput, 'gradientSpeed', Number);
    bindText(customFillInput, 'customFill');
    bindText(customSvgCodeInput, 'customSvgCode');

    gradientAnimateInput.addEventListener('change', () => {
      gradientAngleInput.disabled = gradientAnimateInput.checked;
      browser.storage.local.set({ gradientAnimate: gradientAnimateInput.checked }).catch(logError);
    });

    bindCheckbox(dislikesToggle, 'dislikesEnabled');
    bindText(searchPlaceholderInput, 'searchPlaceholder');

    headerGlassToggle.addEventListener('change', () => {
      setHeaderRowVisibility(headerGlassToggle.checked);
      browser.storage.local.set({ headerGlassEnabled: headerGlassToggle.checked }).catch(logError);
    });
    bindText(headerColorLightInput, 'headerColorLight');
    bindText(headerColorDarkInput, 'headerColorDark');
    bindText(headerBlurInput, 'headerBlur', Number);
    bindText(headerOpacityInput, 'headerOpacity', Number);
    bindText(headerMarginInput, 'headerMargin', Number);
    bindText(headerRadiusInput, 'headerRadius', Number);
  } catch (error) {
    console.error('Failed to initialize popup: ' + error);
  }
});
