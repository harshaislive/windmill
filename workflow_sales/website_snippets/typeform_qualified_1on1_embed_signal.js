(function () {
  "use strict";

  if (window.BeforestQualified1on1Signal) return;

  var ENDPOINT = "https://flows.ops.beforest.co/api/r/sales/typeform/qualified-1on1-signal";
  var SIGNAL_TYPE = "typeform_embed_question_reached";
  var FORM_CONFIG = {
    CYae8hmZ: { formId: "CYae8hmZ", ref: "113a9ad4-4d43-4165-9bf7-62f82b1352ab" },
    kfcjiXxR: { formId: "kfcjiXxR", ref: "1292d853-e1d7-438a-8f82-70fbad90e914" },
    hbDB2ybS: { formId: "hbDB2ybS", ref: "f8e95240-2bd9-4522-8eac-53860c400950" },
    i8eBLQkz: { formId: "i8eBLQkz", ref: "4c30971d-c15d-42f8-90d1-94c19a475c4d" },
    leXyUOuT: { formId: "leXyUOuT", ref: "113a9ad4-4d43-4165-9bf7-62f82b1352ab" },
    "01KVFCGFDB0S9M80A066Z7XV58": { formId: "leXyUOuT", ref: "113a9ad4-4d43-4165-9bf7-62f82b1352ab" }
  };
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  function queryValue(key) {
    return new URLSearchParams(window.location.search).get(key) || "";
  }

  function cookieValue(name) {
    var prefix = name + "=";
    var parts = document.cookie ? document.cookie.split(";") : [];
    for (var index = 0; index < parts.length; index++) {
      var part = parts[index].trim();
      if (part.indexOf(prefix) === 0) return decodeURIComponent(part.slice(prefix.length));
    }
    return "";
  }

  function attribution() {
    var values = {
      fbp: cookieValue("_fbp"),
      fbc: cookieValue("_fbc"),
      fbclid: queryValue("fbclid")
    };
    UTM_KEYS.forEach(function (key) {
      values[key] = queryValue(key);
    });
    return values;
  }

  function hiddenWithAttribution(existingHidden) {
    var merged = Object.assign({}, existingHidden || {});
    UTM_KEYS.forEach(function (key) {
      var value = queryValue(key);
      if (value) merged[key] = value;
    });
    return merged;
  }

  function send(payload) {
    var serialized = JSON.stringify(payload);
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, serialized)) return;
    fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      credentials: "omit",
      keepalive: true,
      body: serialized
    }).catch(function () {
      // Delivery is verified in Windmill/Meta; no respondent-facing error is shown.
    });
  }

  function options(formId, existingHidden) {
    var config = FORM_CONFIG[formId];
    var canonicalFormId = config ? config.formId : formId;
    var expectedRef = config ? config.ref : "";
    var responseId = "";
    var reachedQualifiedQuestion = false;
    var sent = false;

    function trySend() {
      if (sent || !expectedRef || !responseId || !reachedQualifiedQuestion) return;
      sent = true;
      send(Object.assign({
        signal_type: SIGNAL_TYPE,
        form_id: canonicalFormId,
        response_id: responseId,
        question_ref: expectedRef,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: window.location.href
      }, attribution()));
    }

    return {
      hidden: hiddenWithAttribution(existingHidden),
      onStarted: function (event) {
        responseId = event && event.responseId ? String(event.responseId) : "";
        trySend();
      },
      onQuestionChanged: function (event) {
        if (!event || event.ref !== expectedRef) return;
        if (event.formId && event.formId !== formId && event.formId !== canonicalFormId) return;
        reachedQualifiedQuestion = true;
        trySend();
      }
    };
  }

  function composeCallbacks(existingCallback, signalCallback) {
    return function (event) {
      try {
        if (typeof existingCallback === "function") existingCallback(event);
      } finally {
        signalCallback(event);
      }
    };
  }

  function mergeOptions(formId, existingOptions) {
    var merged = Object.assign({}, existingOptions || {});
    if (!FORM_CONFIG[formId]) return merged;
    var signalOptions = options(formId, merged.hidden);
    merged.hidden = signalOptions.hidden;
    merged.onStarted = composeCallbacks(merged.onStarted, signalOptions.onStarted);
    merged.onQuestionChanged = composeCallbacks(merged.onQuestionChanged, signalOptions.onQuestionChanged);
    return merged;
  }

  function patchTypeform(tf) {
    if (!tf || typeof tf.createPopup !== "function") return false;
    if (tf.createPopup.__beforestQualified1on1Patched) return true;
    var originalCreatePopup = tf.createPopup;
    function patchedCreatePopup(formId, existingOptions) {
      return originalCreatePopup.call(this, formId, mergeOptions(formId, existingOptions));
    }
    patchedCreatePopup.__beforestQualified1on1Patched = true;
    tf.createPopup = patchedCreatePopup;
    return true;
  }

  function install() {
    if (patchTypeform(window.tf)) return;

    var descriptor = Object.getOwnPropertyDescriptor(window, "tf");
    if (!window.tf && (!descriptor || descriptor.configurable)) {
      var tfValue;
      Object.defineProperty(window, "tf", {
        configurable: true,
        enumerable: true,
        get: function () { return tfValue; },
        set: function (value) {
          tfValue = value;
          patchTypeform(value);
        }
      });
    }

    var attempts = 0;
    var patchTimer = window.setInterval(function () {
      attempts++;
      if (patchTypeform(window.tf) || attempts >= 200) window.clearInterval(patchTimer);
    }, 50);
  }

  window.BeforestQualified1on1Signal = {
    options: options,
    mergeOptions: mergeOptions,
    install: install,
    supportedForms: Object.keys(FORM_CONFIG)
  };
  install();
})();
