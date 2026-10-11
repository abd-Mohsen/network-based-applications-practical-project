window.RF = (function () {
  const RF = {};

  // --- i18n --------------------------------------------------------------
  // Toggling reloads the page (see RF.setLang) rather than hot-swapping the
  // DOM -- simplest correct option for a lab tool, and it means dir/lang
  // flip cleanly with no half-translated state to worry about.

  RF.STRINGS = {
    ar: {
      "nav.rider": "الراكب",
      "nav.driver": "السائق",
      "nav.dashboard": "لوحة القيادة",
      "nav.control": "غرفة التحكم",
      "lang.toggle": "English",

      "stage.requested": "مطلوبة",
      "stage.accepted": "مقبولة",
      "stage.completed": "مكتملة",
      "stage.fraud": "فحص احتيال",
      "stage.paid": "مدفوعة",
      "stage.notified": "إشعار السائق",
      "stage.cancelled": "أُلغيت",

      "time.now": "الآن",
      "time.secondsAgo": "منذ {n} ث",
      "time.minutesAgo": "منذ {n} د",
      "time.hoursAgo": "منذ {n} س",

      "rider.title": "اطلب رحلة",
      "rider.subtitle":
        "كل مرحلة أدناه تُحسَم مباشرةً من خدمة مختلفة — trip-service تملك «مطلوبة/مقبولة/مكتملة»، وpayment-service تملك فحص الاحتيال والدفع، وnotification-service تملك إشعار السائق (webhook).",
      "rider.newTrip.heading": "رحلة جديدة",
      "rider.newTrip.hint": "تمرّ عبر البوّابة (gateway) كأي طلب كتابة آخر في هذا النظام — موثّقة بـ JWT ومحدودة المعدّل.",
      "rider.label.origin": "نقطة الانطلاق",
      "rider.label.destination": "الوجهة",
      "rider.label.fare": "الأجرة",
      "rider.placeholder.origin": "ساحة الأمويين",
      "rider.placeholder.destination": "جامعة دمشق",
      "rider.fare.autoHint": "تُقدَّر الأجرة تلقائياً حسب المسار — لا حاجة لإدخالها.",
      "rider.submit": "اطلب الرحلة",
      "rider.myTrips.heading": "رحلاتي",
      "rider.connecting": "جارٍ الاتصال…",
      "rider.empty": "لا توجد رحلات بعد — اطلب واحدة أعلاه.",
      "rider.ridingAs": "راكب باسم",
      "rider.requestedAgo": "طُلبت",
      "rider.driverLabel": "السائق",
      "rider.error.default": "تعذّر طلب الرحلة",
      "rider.cancel.button": "إلغاء",
      "rider.error.cancel": "تعذّر إلغاء الرحلة",

      "driver.title": "طابور السائق",
      "driver.subtitle":
        "قبول رحلة هو كتابة متزامنة عبر البوّابة إلى trip-service. أمّا إنهاؤها فهو ما يُطلق فعلياً حدث <code>trip.completed</code> على المحور اللاتزامني — لا يتحرّك شيء في الأسفل حتى تفعل ذلك.",
      "driver.active.heading": "رحلتك الحالية",
      "driver.complete.button": "أنهِ الرحلة",
      "driver.incoming.heading": "الطلبات الواردة",
      "driver.queue.empty": "لا توجد طلبات معلّقة حالياً.",
      "driver.accept.button": "قبول",
      "driver.history.heading": "ما أنجزتَه مؤخراً",
      "driver.history.empty": "لا شيء بعد.",
      "driver.riderLabel": "الراكب",
      "driver.requestedAgo": "طُلبت",
      "driver.drivingAs": "سائق باسم",
      "driver.error.accept": "تعذّر قبول الرحلة",
      "driver.error.complete": "تعذّر إنهاء الرحلة",

      "dash.title": "مقاييس حيّة",
      "dash.subtitle":
        "كل رقم هنا مسحوب مباشرةً من نقطة <code>/metrics</code> الخاصّة بكل خدمة، إضافةً إلى واجهة إدارة RabbitMQ لعمق الطوابير — «راقب الوصلة لا الطرفين فقط».",
      "dash.queues.heading": "طوابير RabbitMQ",
      "dash.table.queue": "الطابور",
      "dash.table.depth": "العمق",
      "dash.table.consumers": "المستهلكون",
      "dash.unreachable": "غير متاح",
      "dash.breaker": "القاطع",
      "dash.consumerPaused": "المستهلك متوقف",
      "dash.down": "متعطّل",
      "dash.breaker.open": "مفتوح",
      "dash.breaker.halfOpen": "نصف مفتوح",
      "dash.breaker.closed": "مغلق",
      "dash.nonEmpty": "غير فارغ",
      "dash.updatedAgo": "آخر تحديث",

      "control.title": "غرفة التحكم",
      "control.subtitle":
        'كل ما يفعله <code>chaos/chaos.js</code> من الطرفية، كأزرار. استخدمها لتشغيل التجارب في <code>docs/dimensions/</code> بينما تراقب <a href="/dashboard">لوحة القيادة</a> في تبويب آخر.',
      "control.consumers.heading": "المستهلكون (Consumers)",
      "control.consumers.hint": "أوقِف مستهلكاً أثناء التدفّق، ثم وَلِّد حِملاً، ثم استأنفه — هذه هي تجربة الصمود.",
      "control.pausePayment": "إيقاف payment",
      "control.resumePayment": "استئناف payment",
      "control.pauseNotification": "إيقاف notification",
      "control.resumeNotification": "استئناف notification",
      "control.dup.heading": "تكرار التسليم",
      "control.dup.hint":
        "يجعل ناشر outbox في trip-service يُعيد تسليم الأحداث الـ n التالية — يختبر مفتاح عدم تكرار الأثر (idempotency) في payment-service.",
      "control.label.count": "العدد",
      "control.dup.button": "كرّر التاليات N",
      "control.fraud.hint":
        "التبعية المتزامنة — أوقفها قسرياً لترى قاطع الدارة (circuit breaker) ينفتح، أو أبطئها لترى المحاولات تتراكم.",
      "control.kill": "إيقاف قسري",
      "control.restore": "استعادة",
      "control.label.latency": "حقن تأخير (ملي ثانية)",
      "control.setLatency": "تعيين التأخير",
      "control.gateway.heading": "بوّابة API (Nginx)",
      "control.gateway.hint":
        "إيقاف فعلي لحاوية gateway (ليس مجرد تعطيل برمجي) — edge (Nginx) يبقى يعمل ويُظهر صفحة خطأ Nginx الأصلية (502/504) عند أي طلب. أعِد تشغيلها للعودة للوضع الطبيعي.",
      "control.gateway.stop": "إيقاف gateway",
      "control.gateway.start": "تشغيل gateway",

      "control.load.heading": "توليد حمل",
      "control.load.hint": 'يُنشئ N رحلة عبر البوّابة مع <code>autoComplete: true</code> — تماماً مثل أمر <code>generate-trips</code> في الطرفية.',
      "control.generate": "توليد رحلات",
      "control.log.heading": "سجلّ النشاط",
      "control.log.empty": "لم يُنفَّذ شيء بعد.",

      "metric.tokensIssued": "رموز أُصدرت",
      "metric.requestsProxied": "طلبات مُمرَّرة",
      "metric.authFailures": "فشل مصادقة",
      "metric.rateLimited": "طلبات رُفضت (تحديد المعدّل)",
      "metric.tripsCreated": "رحلات أُنشئت",
      "metric.tripsAccepted": "رحلات قُبلت",
      "metric.tripsCompleted": "رحلات اكتملت",
      "metric.tripsCancelled": "رحلات أُلغيت",
      "metric.outboxPublished": "أحداث نُشرت (outbox)",
      "metric.publishFailedLost": "نشر فشل (حدث مفقود)",
      "metric.chaosDuplicatesSent": "تكرارات فوضى أُرسلت",
      "metric.outboxPending": "أحداث مُعلّقة (outbox)",
      "metric.duplicateNextN": "تكرار الطلبات القادمة",
      "metric.requests": "طلبات",
      "metric.forcedFailures": "أعطال مفروضة (chaos)",
      "metric.latencyMs": "تأخير مُحقَن (ملي ثانية)",
      "metric.approved": "مقبولة",
      "metric.declined": "مرفوضة",
      "metric.consumed": "رسائل اُستُهلكت",
      "metric.duplicatesDetected": "تكرارات اكتُشفت",
      "metric.processed": "عُولجت",
      "metric.failuresToDlq": "أُرسلت لطابور الموتى (DLQ)",
      "metric.fraudCallFailures": "فشل نداء فحص الاحتيال",
      "metric.breakerOpens": "مرّات انفتاح القاطع",
      "metric.breakerShortCircuits": "دارات قصيرة (القاطع مفتوح)",
      "metric.webhooksSent": "webhooks أُرسلت",
      "metric.webhookSendFailures": "فشل إرسال webhook",
      "metric.webhooksReceived": "webhooks استُلمت",
      "metric.webhookSignatureFailures": "فشل توقيع webhook",

      "token.heading": "رمز JWT",
      "token.hint":
        "هذا هو الرمز المُرسَل مع كل طلب كتابة عبر البوّابة. عدِّله يدوياً لتكسره عمداً وشاهد البوّابة ترفض الطلب التالي — أو اضغط «توليد رمز جديد» لاستعادة رمز صالح لهذا المستخدم.",
      "token.reset.button": "توليد رمز جديد",
      "token.invalid": "تعذّر فك تشفير الرمز — تنسيق غير صالح",
    },
    en: {
      "nav.rider": "Rider",
      "nav.driver": "Driver",
      "nav.dashboard": "Dashboard",
      "nav.control": "Control",
      "lang.toggle": "العربية",

      "stage.requested": "Requested",
      "stage.accepted": "Accepted",
      "stage.completed": "Completed",
      "stage.fraud": "Fraud check",
      "stage.paid": "Paid",
      "stage.notified": "Notified",
      "stage.cancelled": "Cancelled",

      "time.now": "just now",
      "time.secondsAgo": "{n}s ago",
      "time.minutesAgo": "{n}m ago",
      "time.hoursAgo": "{n}h ago",

      "rider.title": "Request a trip",
      "rider.subtitle":
        "Each stage below is resolved live from a different service — trip-service owns Requested/Accepted/Completed, payment-service owns the fraud check and payment, notification-service owns the driver webhook.",
      "rider.newTrip.heading": "New trip",
      "rider.newTrip.hint": "Goes through the gateway, same as every other write in this system — JWT-authenticated and rate-limited.",
      "rider.label.origin": "Origin",
      "rider.label.destination": "Destination",
      "rider.label.fare": "Fare",
      "rider.placeholder.origin": "Umayyad Square",
      "rider.placeholder.destination": "Damascus University",
      "rider.fare.autoHint": "Fare is estimated automatically from the route — no need to enter one.",
      "rider.submit": "Request trip",
      "rider.myTrips.heading": "My trips",
      "rider.connecting": "Connecting…",
      "rider.empty": "No trips yet — request one above.",
      "rider.ridingAs": "riding as",
      "rider.requestedAgo": "requested",
      "rider.driverLabel": "driver",
      "rider.error.default": "could not request trip",
      "rider.cancel.button": "Cancel",
      "rider.error.cancel": "could not cancel trip",

      "driver.title": "Driver queue",
      "driver.subtitle":
        "Accepting a trip is a synchronous write through the gateway to trip-service. Completing one is what actually fires the <code>trip.completed</code> event onto the async spine — nothing downstream moves until you do.",
      "driver.active.heading": "Your active trip",
      "driver.complete.button": "Complete trip",
      "driver.incoming.heading": "Incoming requests",
      "driver.queue.empty": "No pending requests right now.",
      "driver.accept.button": "Accept",
      "driver.history.heading": "Recently completed by you",
      "driver.history.empty": "Nothing yet.",
      "driver.riderLabel": "rider",
      "driver.requestedAgo": "requested",
      "driver.drivingAs": "driving as",
      "driver.error.accept": "could not accept trip",
      "driver.error.complete": "could not complete trip",

      "dash.title": "Live metrics",
      "dash.subtitle":
        "Every number here is polled straight from each service's own <code>/metrics</code> endpoint, plus RabbitMQ's management API for queue depth — \"watch the connection, not just the endpoints.\"",
      "dash.queues.heading": "RabbitMQ queues",
      "dash.table.queue": "Queue",
      "dash.table.depth": "Depth",
      "dash.table.consumers": "Consumers",
      "dash.unreachable": "unreachable",
      "dash.breaker": "breaker",
      "dash.consumerPaused": "consumer paused",
      "dash.down": "down",
      "dash.breaker.open": "open",
      "dash.breaker.halfOpen": "half-open",
      "dash.breaker.closed": "closed",
      "dash.nonEmpty": "non-empty",
      "dash.updatedAgo": "updated",

      "control.title": "Control room",
      "control.subtitle":
        'Everything <code>chaos/chaos.js</code> does from the terminal, as buttons. Use this to run the experiments in <code>docs/dimensions/</code> while watching <a href="/dashboard">the dashboard</a> in another tab.',
      "control.consumers.heading": "Consumers",
      "control.consumers.hint": "Stop a consumer mid-stream, then generate load, then resume — this is the resilience experiment.",
      "control.pausePayment": "Pause payment",
      "control.resumePayment": "Resume payment",
      "control.pauseNotification": "Pause notification",
      "control.resumeNotification": "Resume notification",
      "control.dup.heading": "Duplicate delivery",
      "control.dup.hint":
        "Makes trip-service's outbox publisher redeliver the next n events — tests payment-service's idempotency key.",
      "control.label.count": "Count",
      "control.dup.button": "Duplicate next N",
      "control.fraud.hint":
        "The synchronous dependency — kill it to see the circuit breaker open, or slow it to see retries pile up.",
      "control.kill": "Kill",
      "control.restore": "Restore",
      "control.label.latency": "Inject latency (ms)",
      "control.setLatency": "Set latency",
      "control.gateway.heading": "API Gateway (Nginx)",
      "control.gateway.hint":
        "A real stop of the gateway container (not a software toggle) — edge (Nginx) stays up and shows its own genuine error page (502/504) on the next request. Start it again to recover.",
      "control.gateway.stop": "Stop gateway",
      "control.gateway.start": "Start gateway",

      "control.load.heading": "Load generation",
      "control.load.hint": 'Creates N trips through the gateway with <code>autoComplete: true</code> — same as the CLI\'s <code>generate-trips</code>.',
      "control.generate": "Generate trips",
      "control.log.heading": "Activity log",
      "control.log.empty": "Nothing run yet.",

      "metric.tokensIssued": "Tokens issued",
      "metric.requestsProxied": "Requests proxied",
      "metric.authFailures": "Auth failures",
      "metric.rateLimited": "Rate limited",
      "metric.tripsCreated": "Trips created",
      "metric.tripsAccepted": "Trips accepted",
      "metric.tripsCompleted": "Trips completed",
      "metric.tripsCancelled": "Trips cancelled",
      "metric.outboxPublished": "Outbox published",
      "metric.publishFailedLost": "Publish failed (lost)",
      "metric.chaosDuplicatesSent": "Chaos duplicates sent",
      "metric.outboxPending": "Outbox pending",
      "metric.duplicateNextN": "Duplicate next N",
      "metric.requests": "Requests",
      "metric.forcedFailures": "Forced failures",
      "metric.latencyMs": "Injected latency (ms)",
      "metric.approved": "Approved",
      "metric.declined": "Declined",
      "metric.consumed": "Consumed",
      "metric.duplicatesDetected": "Duplicates detected",
      "metric.processed": "Processed",
      "metric.failuresToDlq": "Failures to DLQ",
      "metric.fraudCallFailures": "Fraud-check call failures",
      "metric.breakerOpens": "Breaker opens",
      "metric.breakerShortCircuits": "Breaker short-circuits",
      "metric.webhooksSent": "Webhooks sent",
      "metric.webhookSendFailures": "Webhook send failures",
      "metric.webhooksReceived": "Webhooks received",
      "metric.webhookSignatureFailures": "Webhook signature failures",

      "token.heading": "JWT token",
      "token.hint":
        'This is the token sent with every write through the gateway. Edit it to break it on purpose and watch the gateway reject the next request — or click "New token" to get a fresh, valid one for this user.',
      "token.reset.button": "New token",
      "token.invalid": "could not decode token — invalid format",
    },
  };

  RF.lang = function () {
    return localStorage.getItem("rideflow.lang") || "ar";
  };

  RF.setLang = function (lang) {
    localStorage.setItem("rideflow.lang", lang);
    location.reload();
  };

  RF.toggleLang = function () {
    RF.setLang(RF.lang() === "ar" ? "en" : "ar");
  };

  RF.t = function (key) {
    const dict = RF.STRINGS[RF.lang()] || RF.STRINGS.ar;
    return dict[key] || RF.STRINGS.ar[key] || key;
  };

  // Dashboard /metrics field names (tripsCreated, breakerOpens, ...) are
  // literal API identifiers -- translate the ones we know about for display,
  // but fall back to showing the raw identifier (untranslated, monospace)
  // for anything not yet in the dictionary, so a new metric never just
  // disappears or prints a raw "metric.xyz" key.
  RF.isKnownMetric = function (key) {
    return Boolean(RF.STRINGS.en["metric." + key] || RF.STRINGS.ar["metric." + key]);
  };
  RF.metricLabel = function (key) {
    return RF.isKnownMetric(key) ? RF.t("metric." + key) : key;
  };

  // Applies document direction/lang immediately (call this first, before
  // paint, to avoid a flash of the wrong direction), then fills every
  // [data-i18n]/[data-i18n-html]/[data-i18n-placeholder] element.
  RF.applyI18n = function () {
    const lang = RF.lang();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = RF.t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = RF.t(el.getAttribute("data-i18n-html"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", RF.t(el.getAttribute("data-i18n-placeholder")));
    });
  };

  RF.getOrCreateId = function (storageKey, prefix) {
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = prefix + "-" + Math.random().toString(16).slice(2, 8);
      localStorage.setItem(storageKey, id);
    }
    return id;
  };

  RF.connectEvents = function (onSnapshot) {
    const es = new EventSource("/events");
    es.onmessage = function (ev) {
      try {
        onSnapshot(JSON.parse(ev.data));
      } catch (err) {
        console.error("bad SSE payload", err);
      }
    };
    return es;
  };

  // --- global "please wait" cursor ----------------------------------------
  // Some requests (stop/start the gateway container, for instance) take real
  // seconds, not milliseconds -- a disabled button alone doesn't make that
  // obvious. Counter-based so overlapping in-flight requests (e.g. a trip
  // write plus a background token fetch) don't prematurely clear it.
  let busyCount = 0;
  function beginBusy() {
    busyCount++;
    document.documentElement.classList.add("rf-busy");
  }
  function endBusy() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) document.documentElement.classList.remove("rf-busy");
  }

  // --- per-user JWT (token panel on rider/driver pages) -------------------
  // Each browser tab gets its own token (clientId = that tab's riderId/
  // driverId), fetched once and then left alone -- see RF.ensureToken.

  RF.fetchNewToken = async function (clientId) {
    beginBusy();
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.token) throw new Error(data.error || "token request failed");
      return data.token;
    } finally {
      endBusy();
    }
  };

  // Reuses whatever is already in storage -- including a value the user
  // broke by hand -- rather than silently fetching a fresh (valid) one on
  // every page load, which would undo the point of editing it.
  RF.ensureToken = async function (storageKey, clientId) {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const token = await RF.fetchNewToken(clientId);
    localStorage.setItem(storageKey, token);
    return token;
  };

  // Decodes the JWT payload for display only -- no signature check, this is
  // just so the panel can show clientId/scope/exp. Returns null on anything
  // that isn't a well-formed three-part token (e.g. a hand-edited one).
  RF.decodeJwtClaims = function (token) {
    try {
      const parts = String(token).split(".");
      if (parts.length !== 3) return null;
      const json = decodeURIComponent(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(json);
    } catch (err) {
      return null;
    }
  };

  // Renders an editable token panel into `container`. Typing in it saves
  // immediately (that's what makes "edit it, then submit" actually break the
  // next request), and the reset button fetches a brand-new valid token.
  RF.renderTokenPanel = function (container, storageKey, clientId) {
    container.innerHTML =
      '<h2>' +
      RF.t("token.heading") +
      '</h2>' +
      '<p class="hint">' +
      RF.t("token.hint") +
      '</p>' +
      '<textarea id="token-input" class="mono" rows="3" spellcheck="false" ' +
      'style="width:100%; resize:vertical; font-size:11px; padding:9px 11px; border:1px solid var(--rule); border-radius:8px; background:var(--bg); color:var(--ink); direction:ltr;"></textarea>' +
      '<div class="btn-row" style="margin-top:10px;">' +
      '<button type="button" class="btn-secondary" id="token-reset">' +
      RF.t("token.reset.button") +
      "</button>" +
      "</div>" +
      '<div id="token-claims" class="hint mono" style="margin-top:10px; margin-bottom:0; direction:ltr; white-space:pre-wrap;"></div>';

    const textarea = container.querySelector("#token-input");
    const claimsEl = container.querySelector("#token-claims");
    const resetBtn = container.querySelector("#token-reset");

    function renderClaims(token) {
      const claims = RF.decodeJwtClaims(token);
      claimsEl.textContent = claims
        ? "clientId=" + claims.clientId + "  scope=" + claims.scope + "  exp=" + new Date(claims.exp * 1000).toLocaleTimeString()
        : RF.t("token.invalid");
    }

    function load() {
      const t = localStorage.getItem(storageKey) || "";
      textarea.value = t;
      renderClaims(t);
    }
    load();

    textarea.addEventListener("input", function () {
      const v = textarea.value.trim();
      localStorage.setItem(storageKey, v);
      renderClaims(v);
    });

    resetBtn.addEventListener("click", async function () {
      resetBtn.disabled = true;
      try {
        const token = await RF.fetchNewToken(clientId);
        localStorage.setItem(storageKey, token);
        load();
      } catch (err) {
        alert(err.message || "could not get a new token");
      } finally {
        resetBtn.disabled = false;
      }
    });
  };

  RF.postJSON = async function (url, body, token) {
    beginBusy();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: token
          ? { "content-type": "application/json", authorization: "Bearer " + token }
          : { "content-type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        const err = new Error(data.error || res.statusText);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } finally {
      endBusy();
    }
  };

  RF.timeAgo = function (iso) {
    if (!iso) return "";
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 5) return RF.t("time.now");
    if (s < 60) return RF.t("time.secondsAgo").replace("{n}", s);
    const m = Math.floor(s / 60);
    if (m < 60) return RF.t("time.minutesAgo").replace("{n}", m);
    const h = Math.floor(m / 60);
    return RF.t("time.hoursAgo").replace("{n}", h);
  };

  RF.escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  // The six-stage trip stepper: requested -> accepted -> completed ->
  // fraud-checked -> paid -> driver notified. Each later stage is resolved by
  // the web BFF cross-referencing a different service (payment-service,
  // notification-service) -- this is the per-trip timeline the whole GUI is
  // built around.
  RF.stepperHtml = function (trip) {
    const payment = trip.timeline && trip.timeline.payment;
    const notification = trip.timeline && trip.timeline.notification;

    if (trip.status === "cancelled") {
      return (
        '<div class="step done"><div class="node"></div><div class="label">' +
        RF.t("stage.requested") +
        '</div></div><div class="step-line"></div><div class="step declined"><div class="node"></div><div class="label">' +
        RF.t("stage.cancelled") +
        "</div></div>"
      );
    }

    const stages = [
      { label: RF.t("stage.requested"), done: true },
      { label: RF.t("stage.accepted"), done: trip.status === "accepted" || trip.status === "completed" },
      { label: RF.t("stage.completed"), done: trip.status === "completed" },
    ];

    const fraudStage = { label: RF.t("stage.fraud"), done: false, declined: false };
    const paidStage = { label: RF.t("stage.paid"), done: false };
    const notifiedStage = { label: RF.t("stage.notified"), done: false };

    if (payment && payment.approved === true) {
      fraudStage.done = true;
      paidStage.done = true;
    } else if (payment && payment.approved === false) {
      fraudStage.done = true;
      fraudStage.declined = true;
    }
    if (notification) notifiedStage.done = true;

    const all = stages.concat([fraudStage, paidStage, notifiedStage]);

    return all
      .map(function (s, i) {
        const cls = s.declined ? "declined" : s.done ? "done" : "";
        const line =
          i < all.length - 1
            ? '<div class="step-line ' + (s.done && !s.declined ? "done" : "") + '"></div>'
            : "";
        return '<div class="step ' + cls + '"><div class="node"></div><div class="label">' + s.label + "</div></div>" + line;
      })
      .join("");
  };

  RF.statusPill = function (status) {
    const map = {
      requested: ["pill-gray", "stage.requested"],
      accepted: ["pill-sync", "stage.accepted"],
      completed: ["pill-accent", "stage.completed"],
      cancelled: ["pill-gray", "stage.cancelled"],
    };
    const entry = map[status] || ["pill-gray", null];
    return '<span class="pill ' + entry[0] + '">' + (entry[1] ? RF.t(entry[1]) : status) + "</span>";
  };

  RF.navHtml = function (active) {
    const items = [
      ["/", RF.t("nav.rider")],
      ["/driver", RF.t("nav.driver")],
      ["/dashboard", RF.t("nav.dashboard")],
      ["/control", RF.t("nav.control")],
    ];
    const links = items
      .map(function (it) {
        const cls = "nav-link" + (it[0] === active ? " active" : "");
        return '<a class="' + cls + '" href="' + it[0] + '">' + it[1] + "</a>";
      })
      .join("");
    return (
      '<nav class="nav"><a class="nav-brand" href="/"><span class="dot"></span>RideFlow</a>' +
      links +
      '<div class="nav-spacer"></div>' +
      '<button type="button" class="lang-toggle" onclick="RF.toggleLang()">' + RF.t("lang.toggle") + "</button>" +
      '<div id="nav-id" class="nav-id"></div></nav>'
    );
  };

  RF.applyI18n();

  return RF;
})();
