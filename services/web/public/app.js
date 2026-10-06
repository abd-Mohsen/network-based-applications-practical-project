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
      "rider.submit": "اطلب الرحلة",
      "rider.howTo.heading": "كيف تُقرأ الجدول الزمني؟",
      "rider.howTo.hint": "ست مراحل، كل واحدة تُضيئها خدمة مختلفة:",
      "rider.howTo.footer": 'يجب أن يقبل سائقٌ رحلتك أولاً — افتح <a href="/driver">صفحة السائق</a> (يُفضَّل في تبويب آخر) لتحريكها.',
      "rider.myTrips.heading": "رحلاتي",
      "rider.connecting": "جارٍ الاتصال…",
      "rider.empty": "لا توجد رحلات بعد — اطلب واحدة أعلاه.",
      "rider.ridingAs": "راكب باسم",
      "rider.requestedAgo": "طُلبت",
      "rider.driverLabel": "السائق",
      "rider.error.default": "تعذّر طلب الرحلة",

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
      "control.load.heading": "توليد حمل",
      "control.load.hint": 'يُنشئ N رحلة عبر البوّابة مع <code>autoComplete: true</code> — تماماً مثل أمر <code>generate-trips</code> في الطرفية.',
      "control.generate": "توليد رحلات",
      "control.log.heading": "سجلّ النشاط",
      "control.log.empty": "لم يُنفَّذ شيء بعد.",
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
      "rider.submit": "Request trip",
      "rider.howTo.heading": "How to read the timeline",
      "rider.howTo.hint": "Six stages, each lit by a different service:",
      "rider.howTo.footer": 'A driver has to accept your trip first — open <a href="/driver">the driver page</a> (ideally in another tab) to move it along.',
      "rider.myTrips.heading": "My trips",
      "rider.connecting": "Connecting…",
      "rider.empty": "No trips yet — request one above.",
      "rider.ridingAs": "riding as",
      "rider.requestedAgo": "requested",
      "rider.driverLabel": "driver",
      "rider.error.default": "could not request trip",

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
      "control.load.heading": "Load generation",
      "control.load.hint": 'Creates N trips through the gateway with <code>autoComplete: true</code> — same as the CLI\'s <code>generate-trips</code>.',
      "control.generate": "Generate trips",
      "control.log.heading": "Activity log",
      "control.log.empty": "Nothing run yet.",
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

  RF.postJSON = async function (url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
