import { API_ORIGIN } from '../../api/client.js';
import { http as http_, authService as authService_, realtimeService as realtimeService_, gradesUpdateService as gradesUpdateService_, gradeColumnConfigService as gradeColumnConfigService_, sanitizer as sanitizer_, firstValueFrom, deps } from './compat.js';

const setTimeout = (fn, ms, ...a) => globalThis.setTimeout((...x) => { try { return fn(...x); } finally { deps.tick && deps.tick(); } }, ms, ...a);
const setInterval = (fn, ms, ...a) => globalThis.setInterval((...x) => { try { return fn(...x); } finally { deps.tick && deps.tick(); } }, ms, ...a);

/* Lógica de Calificaciones portada 1:1 desde grades.ts del original (misma clase y mismos métodos). */
export class Grades {
  allGrades = ["Grado 1\xBA", "Grado 2\xBA", "Grado 3\xBA", "Grado 4\xBA", "Grado 5\xBA", "Grado 6\xBA", "Grado 7\xBA", "Grado 8\xBA", "Grado 9\xBA", "Grado 10\xBA", "Grado 11\xBA"];
  grades = [...this.allGrades];
  classrooms = ["Salon A", "Salon B"];
  isFadingOut = false;
  isFadingIn = false;
  teacherGradeRange = null;
  // Nombres de las notas (8 columnas: 7 ACT + 1 Eval.Period)
  noteNames = ["ACT1", "ACT2", "ACT3", "ACT4", "ACT5", "ACT6", "ACT7", "Eval.Period", "Auto.Eval", "Prom.Parc"];
  selectedGrade = null;
  selectedClassroom = null;
  selectedPeriod = 1;
  availablePeriods = [1];
  // Current year (dynamic)
  currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  // Check if there's an active period
  hasActivePeriod = false;
  students = [];
  // Loading state
  isLoading = false;
  showLoadingScreen = false;
  // gradesData[studentId][noteIndex] = gradeValue
  gradesData = {};
  // Recovery data por materia y periodo: recoveryData[studentId]["subjectName|period"]
  recoveryData = {};
  // Track focused cell for keyboard navigation
  focusedCell = null;
  hasTeacherGradeRange = null;
  // null = checking, false = no subjects, true = has subjects
  teacherSubjectName = null;
  teacherSubjects = [];
  selectedSubject = null;
  selectedSubjectId = null;
  // ── Configuración de columnas de notas (Quiz/Taller/Actividad) ──────
  showColumnConfigModal = false;
  columnConfigLoading = false;
  columnConfigError = "";
  gradeColumns = [];
  quizzesPct = 0;
  talleresPct = 0;
  actividadesPct = 0;
  newColumnName = "";
  newColumnType = "QUIZ";
  // Notas de las columnas dinámicas: { [studentId]: { [columnId]: valor } }
  dynamicGradeValues = {};
  savingDynamicCell = {};
  // Grupo ACT (ACT1..ACT7): un nombre y un porcentaje (1-100) para todas.
  actName = "ACT";
  // nombre editable del grupo ACT1..ACT7
  actPct = null;
  // un solo porcentaje para todas las ACT
  evalPct = 20;
  // porcentaje de Eval.Period en la nota final (editable)
  // Nombres con porcentaje creados en el panel "Porcentajes" (Quiz, Taller...).
  categories = [];
  showPctPanel = false;
  showAddCategoryForm = false;
  addCategoryName = "";
  addCategoryPct = null;
  addCategoryError = "";
  // Menú del "+" de la tabla (elegir un nombre para agregar una columna).
  showAddColumnMenu = false;
  // Evita que saveNFinal calcule con porcentajes/columnas a medio cargar
  // (sobrescribiría la nota final guardada con un valor incorrecto).
  weightsReady = false;
  gradesLoaded = false;
  saveConfigTimer = null;
  /** Curso (profesor|materia|grado|salón) al que pertenecen los porcentajes que hay
   *  en pantalla. Solo se guarda en el servidor si coincide con el curso seleccionado:
   *  así nunca se escribe la config de un salón dentro de otro. */
  configContextKey = null;
  columnConfigSub = null;
  pctOverNotified = false;
  get totalConfigPct() {
    return (this.quizzesPct || 0) + (this.talleresPct || 0) + (this.actividadesPct || 0);
  }
  // AI Study Plan modal
  showStudyPlanModal = false;
  studyPlanTopics = "";
  studyPlanContent = "";
  selectedStudentForPlan = null;
  isGeneratingPlan = false;
  extractedImages = [];
  uploadedImages = [];
  // Progress bar for plan generation
  progressPercent = 0;
  showProgressBar = false;
  planGenerated = false;
  planSaved = false;
  // Track generated recovery plans for students
  generatedPlans = {};
  // ----- Cola de guardado para no perder notas al cambiar de salón/período o recargar -----
  gradeSaveQueue = /* @__PURE__ */ new Map();
  gradeSaveTimers = /* @__PURE__ */ new Map();
  gradeSaveInFlight = /* @__PURE__ */ new Set();
  gradeSaveLast = /* @__PURE__ */ new Map();
  recoverySaveTimers = /* @__PURE__ */ new Map();
  recoverySaveInFlight = /* @__PURE__ */ new Set();
  recoveryLast = /* @__PURE__ */ new Map();
  flushWaiters = [];
  // API Key for Groq AI
  // La generación de planes de estudio se delega al backend (proxy a NVIDIA),
  // que es quien guarda la API key de forma segura.
  AI_PROXY_BASE = "/api/ai";
  gradesUpdateService = gradesUpdateService_;
  realtimeService = realtimeService_;
  authService = authService_;
  gradeColumnConfigService = gradeColumnConfigService_;
  get dialogService() {
    return deps.dialogService;
  }
  // Nota mínima para aprobar, configurable en Configuración de Año
  // (Administrador). Por defecto 3.5 hasta que se cargue la configurada.
  minPassingGrade = 3.5;
  loadMinPassingGrade() {
    this.http.get(API_ORIGIN + "/api/school-year/min-passing-grade").subscribe({
      next: (res) => {
        if (typeof res.minPassingGrade === "number") {
          this.minPassingGrade = res.minPassingGrade;
        }
      },
      error: () => {
      }
    });
  }
  constructor(cdr) {
    this.cdr = cdr;
    this.http = http_;
    this.ngZone = { run: (f) => f(), runOutside: (f) => f() };
  }
  sanitizer = sanitizer_;
  studyPlanContentSafe = null;
  getCurrentUser() {
    const current = this.authService.getCurrentUserValue();
    if (current) return current;
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "null");
    } catch {
      return null;
    }
  }
  getCurrentTeacherId() {
    const user = this.getCurrentUser();
    if (user?.id && user?.role && (user.role.name || user.role) === "TEACHER") {
      return Number(user.id);
    }
    return null;
  }
  teacherIdQuery() {
    const teacherId = this.getCurrentTeacherId();
    return teacherId ? `?teacherId=${teacherId}` : "";
  }
  teacherIdParam() {
    const teacherId = this.getCurrentTeacherId();
    return teacherId ? `&teacherId=${teacherId}` : "";
  }
  periodCheckInterval = null;
  periodsSubscription = null;
  previousAvailablePeriods = [1];
  ngOnInit() {
    this.loadTeacherGradeRange();
    this.loadTeacherSubjectsForGradeRange();
    this.loadUnlockedPeriods();
    this.loadExistingRecoveryPlans();
    this.loadMinPassingGrade();
    this._keydownHandler = this.handleKeydown.bind(this);
    document.addEventListener("keydown", this._keydownHandler);
    this.periodsSubscription = this.realtimeService.periods$.subscribe((periods) => {
      const unlockedPeriods = periods.filter((p) => p.isUnlocked).map((p) => p.periodNumber);
      const newPeriods = unlockedPeriods.length > 0 ? unlockedPeriods : [1];
      if (!this.arraysEqual(this.availablePeriods, newPeriods)) {
        this.availablePeriods = newPeriods;
        this.showPeriodChangeNotification();
        if (!this.availablePeriods.includes(this.selectedPeriod)) {
          this.selectedPeriod = Math.max(...this.availablePeriods);
          this.resetColumnConfigState();
          this.loadColumnConfig();
          this.loadGrades();
        }
      }
    });
    this.ngZone.runOutside(() => {
      this.periodCheckInterval = setInterval(() => {
        const previousPeriods = [...this.availablePeriods];
        this.http.get(API_ORIGIN + "/api/periods").subscribe({
          next: (periods) => {
            const unlockedPeriods = periods.filter((p) => p.isUnlocked).map((p) => p.periodNumber);
            const newPeriods = unlockedPeriods.length > 0 ? unlockedPeriods : [1];
            if (!this.arraysEqual(previousPeriods, newPeriods)) {
              this.ngZone.run(() => {
                this.availablePeriods = newPeriods;
                this.showPeriodChangeNotification();
                if (!this.availablePeriods.includes(this.selectedPeriod)) {
                  this.selectedPeriod = Math.max(...this.availablePeriods);
                  this.resetColumnConfigState();
                  this.loadColumnConfig();
                  this.loadGrades();
                }
              });
            }
          }
        });
      }, 1e4);
    });
  }
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, idx) => val === sortedB[idx]);
  }
  showPeriodChangeNotification() {
    this.cdr.detectChanges();
    const existingToast = document.querySelector(".period-change-toast");
    if (existingToast) existingToast.remove();
    const toast = document.createElement("div");
    toast.className = "period-change-toast";
    toast.innerHTML = '<span class="toast-icon">\u{1F514}</span> Los per\xEDodos se han actualizado';
    toast.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.2s ease-out;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = "slideOut 0.2s ease-in forwards";
      setTimeout(() => toast.remove(), 200);
    }, 500);
  }
  // Enviar las notas pendientes al recargar/cerrar (los POST normales se cancelan en unload).
  // Usamos fetch con keepalive (respeta CORS y sobrevive al cierre) y sendBeacon como respaldo.
  onBeforeUnload() {
    for (const key of Array.from(this.gradeSaveTimers.keys())) {
      this.flushGradeKey(key);
    }
    for (const sid of Array.from(this.recoverySaveTimers.keys())) {
      this.flushRecoveryKey(sid);
    }
    for (const item of this.gradeSaveLast.values()) {
      this.sendKeepAlive("/api/grades", this.buildGradePayload(item));
    }
    for (const payload of this.recoveryLast.values()) {
      this.sendKeepAlive("/api/grades/recovery", payload);
    }
  }
  buildGradePayload(item) {
    const gradeName = this.noteNames[item.noteIndex - 1] || `Nota ${item.noteIndex}`;
    return {
      studentId: item.studentId,
      subjectName: this.selectedSubject || this.teacherSubjectName || "MATEMATICAS",
      subjectId: this.selectedSubjectId,
      period: this.selectedPeriod,
      gradeName,
      isEvaluation: item.noteIndex === 8,
      teacherId: this.getCurrentTeacherId(),
      gradeValue: item.value,
      appreciative: ""
    };
  }
  sendKeepAlive(url, data) {
    const body = JSON.stringify(data);
    try {
      if (typeof fetch === "function") {
        const token = this.authService.getToken();
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...token ? { Authorization: `Bearer ${token}` } : {}
          },
          body,
          keepalive: true
        }).catch(() => {
        });
        return;
      }
    } catch {
    }
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      }
    } catch {
    }
  }
  ngOnDestroy() {
    if (this._keydownHandler) document.removeEventListener("keydown", this._keydownHandler);
    if (this.periodCheckInterval) {
      clearInterval(this.periodCheckInterval);
    }
    if (this.periodsSubscription) {
      this.periodsSubscription.unsubscribe();
    }
    this.flushColumnConfig();
    this.columnConfigSub?.unsubscribe();
    for (const key of Array.from(this.gradeSaveTimers.keys())) {
      this.flushGradeKey(key);
    }
    for (const sid of Array.from(this.recoverySaveTimers.keys())) {
      this.flushRecoveryKey(sid);
    }
    this.gradeSaveTimers.clear();
    this.recoverySaveTimers.clear();
  }
  loadUnlockedPeriods() {
    this.http.get(API_ORIGIN + "/api/periods").subscribe({
      next: (periods) => {
        const unlockedPeriods = periods.filter((p) => p.isUnlocked).map((p) => p.periodNumber);
        this.availablePeriods = unlockedPeriods.length > 0 ? unlockedPeriods : [1];
        this.hasActivePeriod = unlockedPeriods.length > 0;
        localStorage.setItem("unlockedPeriods", JSON.stringify(unlockedPeriods.filter((p) => p > 1)));
        this.cdr.markForCheck();
      },
      error: () => {
        const stored = localStorage.getItem("unlockedPeriods");
        this.availablePeriods = stored ? [1, ...JSON.parse(stored).filter((p) => p > 1)] : [1];
      }
    });
  }
  // Load existing recovery plans for students
  loadExistingRecoveryPlans() {
    this.http.get(`${API_ORIGIN}/api/grades/recovery-plans${this.teacherIdQuery()}`).subscribe({
      next: (plans) => {
        this.generatedPlans = {};
        if (plans) {
          for (const plan of plans) {
            const studentId = plan.studentId;
            const period = plan.period;
            if (!this.generatedPlans[studentId]) {
              this.generatedPlans[studentId] = {};
            }
            this.generatedPlans[studentId][period] = true;
          }
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.generatedPlans = {};
      }
    });
  }
  // Check if a student has a generated recovery plan
  hasRecoveryPlan(studentId, period) {
    return this.generatedPlans[studentId]?.[period] === true;
  }
  async selectGrade(grade, classroom) {
    await this.flushSaves();
    this.selectedGrade = grade;
    this.selectedClassroom = classroom;
    this.resetColumnConfigState();
    this.loadUnlockedPeriods();
    this.selectedPeriod = Math.max(...this.availablePeriods);
    this.gradesData = {};
    this.recoveryData = {};
    this.showLoadingScreen = true;
    this.isLoading = true;
    setTimeout(() => {
      this.loadData();
    }, 800);
  }
  async onPeriodChange(period) {
    const newPeriod = parseInt(period.toString());
    if (!this.availablePeriods.includes(newPeriod)) {
      this.dialogService.alert("Este per\xEDodo a\xFAn no est\xE1 desbloqueado. Ve a Configuraci\xF3n para desbloquearlo.", "Per\xEDodo bloqueado");
      return;
    }
    await this.flushSaves();
    this.selectedPeriod = newPeriod;
    this.dynamicGradeValues = {};
    this.resetColumnConfigState();
    this.loadColumnConfig();
    this.loadGrades();
    this.loadRecoveryData();
  }
  // For two-way binding with ngModel
  onPeriodManualChange(period) {
    this.onPeriodChange(period);
  }
  async onSubjectChange(subject) {
    await this.flushSaves();
    this.selectedSubjectId = subject.id ?? null;
    this.selectedSubject = subject.name;
    this.teacherSubjectName = subject.name;
    this.resetColumnConfigState();
    this.applyGradeFilterForSubject(subject, false);
    this.loadGrades();
    this.loadRecoveryData();
    this.loadColumnConfig();
  }
  // ═══════════════════════════════════════════════════════════════════
  // Configuración de columnas de notas (Quiz/Taller/Actividad)
  // ═══════════════════════════════════════════════════════════════════
  currentTeacherId() {
    const user = this.authService.getCurrentUserValue();
    return user?.id ?? null;
  }
  /** Vacía los porcentajes/columnas en pantalla y cancela cualquier carga en curso. */
  resetColumnConfigState() {
    this.columnConfigSub?.unsubscribe();
    this.columnConfigSub = null;
    this.configContextKey = null;
    if (this.saveConfigTimer) {
      clearTimeout(this.saveConfigTimer);
      this.saveConfigTimer = null;
    }
    this.gradeColumns = [];
    this.actPct = null;
    this.actName = "ACT";
    this.evalPct = 20;
    this.categories = [];
    this.quizzesPct = 0;
    this.talleresPct = 0;
    this.actividadesPct = 0;
    this.cdr.markForCheck();
  }
  /** Curso actual (null si falta algo). */
  currentConfigContext() {
    const teacherId = this.currentTeacherId();
    const subjectName = this.selectedSubject || this.teacherSubjectName;
    if (!teacherId || !subjectName || !this.selectedGrade || !this.selectedClassroom || !this.selectedPeriod) return null;
    return {
      teacherId,
      subjectName,
      grade: this.selectedGrade,
      classroom: this.selectedClassroom,
      period: this.selectedPeriod,
      key: `${teacherId}|${subjectName}|${this.selectedGrade}|${this.selectedClassroom}|${this.selectedPeriod}`
    };
  }
  /** Si hay un cambio de porcentajes esperando su guardado, lo envía YA (antes de cambiar de curso). */
  flushColumnConfig() {
    if (!this.saveConfigTimer) return;
    clearTimeout(this.saveConfigTimer);
    this.saveConfigTimer = null;
    this.persistColumnConfig(true);
  }
  loadColumnConfig() {
    this.columnConfigSub?.unsubscribe();
    this.columnConfigSub = null;
    this.configContextKey = null;
    const ctx = this.currentConfigContext();
    if (!ctx) {
      this.gradeColumns = [];
      this.actPct = null;
      this.actName = "ACT";
      this.evalPct = 20;
      this.categories = [];
      this.weightsReady = true;
      return;
    }
    this.weightsReady = false;
    this.columnConfigSub = this.gradeColumnConfigService.getConfig(ctx.teacherId, ctx.subjectName, ctx.grade, ctx.classroom, ctx.period).subscribe({
      next: (config) => {
        this.configContextKey = ctx.key;
        this.quizzesPct = config.quizzesPct || 0;
        this.talleresPct = config.talleresPct || 0;
        this.actividadesPct = config.actividadesPct || 0;
        let all = [];
        try {
          all = JSON.parse(config.columnsJson || "[]");
        } catch {
          all = [];
        }
        const actEntry = all.find((c) => c.id === "act");
        if (actEntry) {
          this.actName = actEntry.label || actEntry.name || "ACT";
          this.actPct = actEntry.pct ?? null;
        } else {
          const legacy = all.filter((c) => /^act[1-7]$/.test(c.id));
          const sum = legacy.reduce((a, c) => a + (c.pct || 0), 0);
          this.actName = "ACT";
          this.actPct = sum > 0 ? Math.min(100, sum) : null;
        }
        const evalEntry = all.find((c) => c.id === "eval");
        this.evalPct = evalEntry?.pct != null ? evalEntry.pct : 20;
        const cats = [];
        const cols = [];
        for (const c of all) {
          if (c.id === "act" || c.id === "eval" || /^act[1-7]$/.test(c.id)) continue;
          if (c.kind === "cat") {
            cats.push({ id: c.id, name: c.name, pct: c.pct ?? null });
          } else if (c.kind === "col") {
            cols.push({ id: c.id, name: c.name, type: "ACTIVIDAD", kind: "col", cat: c.cat });
          } else {
            cats.push({ id: "cat_" + c.id, name: c.label || c.name, pct: c.pct ?? null });
            cols.push({ id: c.id, name: c.name, type: "ACTIVIDAD", kind: "col", cat: "cat_" + c.id });
          }
        }
        this.categories = cats;
        this.gradeColumns = cols;
        if (this.gradeColumns.length > 0) {
          this.loadDynamicGradeValues();
        } else {
          this.markWeightsReady();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.gradeColumns = [];
        this.categories = [];
        this.actPct = null;
        this.evalPct = 20;
        this.markWeightsReady();
        this.cdr.markForCheck();
      }
    });
  }
  markWeightsReady() {
    this.weightsReady = true;
    if (this.gradesLoaded) this.saveAllNFinal();
  }
  saveAllNFinal() {
    for (const student of this.students) {
      this.saveNFinal(student.id);
    }
  }
  // ── Panel "Porcentajes": solo nombres con su porcentaje (1-100) ───────
  /** true si el profesor ya puso al menos un porcentaje: se usa el promedio ponderado. */
  get weightedMode() {
    return (this.actPct ?? 0) > 0 || this.categories.some((c) => (c.pct ?? 0) > 0);
  }
  get totalPctSum() {
    return (this.actPct || 0) + this.evalPct + this.categories.reduce((a, c) => a + (c.pct || 0), 0);
  }
  /** true si la suma de porcentajes (ACT + nombres + Eval.Period) pasa de 100. */
  get pctOver() {
    return this.totalPctSum > 100;
  }
  notifyPctOver() {
    if (this.pctOverNotified) return;
    this.pctOverNotified = true;
    void this.dialogService.alert(
      `Los porcentajes suman ${this.totalPctSum}% y no pueden pasar de 100%. Baja alg\xFAn porcentaje para poder guardar; mientras tanto no se guardar\xE1n los cambios.`,
      "Porcentajes"
    );
  }
  categoryById(id) {
    return this.categories.find((c) => c.id === id);
  }
  /** Encabezado de la columna ACT número n: "ACT1", o "Quiz1" si se renombró el grupo. */
  actHeader(n) {
    return `${this.actName}${n}`;
  }
  /** Encabezado de una columna agregada: nombre de su categoría + número ("Quiz1", "Quiz2"...). */
  colHeader(col) {
    const cat = this.categoryById(col.cat);
    const same = this.gradeColumns.filter((c) => c.cat === col.cat);
    const n = same.findIndex((c) => c.id === col.id) + 1;
    return `${cat ? cat.name : col.name}${n}`;
  }
  parsePct(raw) {
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (isNaN(n)) return null;
    return Math.max(1, Math.min(100, n));
  }
  togglePctPanel() {
    this.showPctPanel = !this.showPctPanel;
    if (!this.showPctPanel) this.showAddCategoryForm = false;
    this.cdr.markForCheck();
  }
  onActPctInput(event) {
    const input = event.target;
    const v = this.parsePct(input.value);
    if (input.value !== "" && v !== null && String(v) !== input.value) input.value = String(v);
    this.actPct = v;
    this.onPctsChanged();
  }
  onActNameInput(event) {
    const name = event.target.value.trim();
    if (!name) return;
    this.actName = name;
    this.onPctsChanged(false);
  }
  onActNameBlur(event) {
    const input = event.target;
    if (!input.value.trim()) input.value = this.actName;
  }
  onEvalPctInput(event) {
    const input = event.target;
    const digits = input.value.replace(/[^0-9]/g, "");
    if (digits === "") return;
    const v = Math.max(0, Math.min(100, parseInt(digits, 10)));
    if (String(v) !== input.value) input.value = String(v);
    this.evalPct = v;
    this.onPctsChanged();
  }
  onEvalPctBlur(event) {
    const input = event.target;
    if (input.value.trim() === "") input.value = String(this.evalPct);
  }
  /** Parte de la nota final que aportan las actividades (100 - Eval.Period). */
  get activitiesShare() {
    return 100 - this.evalPct;
  }
  onCategoryPctInput(cat, event) {
    const input = event.target;
    const v = this.parsePct(input.value);
    if (input.value !== "" && v !== null && String(v) !== input.value) input.value = String(v);
    this.categories = this.categories.map((c) => c.id === cat.id ? { ...c, pct: v } : c);
    this.onPctsChanged();
  }
  onCategoryNameInput(cat, event) {
    const name = event.target.value.trim();
    if (!name) return;
    this.categories = this.categories.map((c) => c.id === cat.id ? { ...c, name } : c);
    this.onPctsChanged(false);
  }
  onCategoryNameBlur(cat, event) {
    const input = event.target;
    if (!input.value.trim()) input.value = cat.name;
  }
  onPctsChanged(recalculate = true) {
    this.cdr.markForCheck();
    if (this.saveConfigTimer) clearTimeout(this.saveConfigTimer);
    this.saveConfigTimer = setTimeout(() => {
      this.saveConfigTimer = null;
      this.persistColumnConfig(recalculate);
    }, 600);
  }
  /** Guarda en el servidor: grupo ACT, categorías (nombre + %) y columnas agregadas. */
  persistColumnConfig(recalculate) {
    const ctx = this.currentConfigContext();
    if (!ctx) return;
    if (ctx.key !== this.configContextKey) return;
    if (this.pctOver) {
      this.notifyPctOver();
      return;
    }
    this.pctOverNotified = false;
    const entries = [
      { id: "act", kind: "cat", name: this.actName, type: "ACTIVIDAD", pct: this.actPct ?? null, base: true },
      { id: "eval", name: "Eval.Period", type: "ACTIVIDAD", pct: this.evalPct, base: true },
      ...this.categories.map((c) => ({
        id: c.id,
        kind: "cat",
        name: c.name,
        type: "ACTIVIDAD",
        pct: c.pct ?? null
      })),
      ...this.gradeColumns.map((c) => ({
        id: c.id,
        kind: "col",
        name: c.name,
        type: "ACTIVIDAD",
        cat: c.cat
      }))
    ];
    this.gradeColumnConfigService.saveConfig(
      ctx.teacherId,
      ctx.subjectName,
      ctx.grade,
      ctx.classroom,
      ctx.period,
      entries,
      0,
      0,
      0
    ).subscribe({
      next: () => {
        if (recalculate) this.saveAllNFinal();
      },
      error: () => {
      }
    });
  }
  // ── "+" del panel: crear un nombre con su porcentaje ────────────────────
  toggleAddCategoryForm() {
    this.showAddCategoryForm = !this.showAddCategoryForm;
    this.addCategoryError = "";
    this.addCategoryName = "";
    this.addCategoryPct = null;
    this.cdr.markForCheck();
  }
  confirmAddCategory() {
    const name = this.addCategoryName.trim();
    if (!name) {
      this.addCategoryError = "Escribe un nombre (ej: Quiz, Taller).";
      return;
    }
    const lower = name.toLowerCase();
    if (lower === this.actName.toLowerCase() || this.categories.some((c) => c.name.toLowerCase() === lower)) {
      this.addCategoryError = "Ya existe un porcentaje con ese nombre.";
      return;
    }
    const pct = this.addCategoryPct != null ? Math.max(1, Math.min(100, Math.round(this.addCategoryPct))) : null;
    if (this.totalPctSum + (pct ?? 0) > 100) {
      const libre = Math.max(0, 100 - this.totalPctSum);
      this.addCategoryError = `La suma no puede pasar de 100%. Solo quedan ${libre}% disponibles.`;
      return;
    }
    this.categories = [...this.categories, {
      id: "cat_" + Date.now() + "_" + Math.floor(Math.random() * 1e3),
      name,
      pct
    }];
    this.showAddCategoryForm = false;
    this.addCategoryName = "";
    this.addCategoryPct = null;
    this.addCategoryError = "";
    this.persistColumnConfig(true);
    this.cdr.markForCheck();
  }
  async removeCategory(cat) {
    const cols = this.gradeColumns.filter((c) => c.cat === cat.id).length;
    const extra = cols > 0 ? ` Se quitar\xE1n tambi\xE9n sus ${cols} columna(s) de la tabla.` : "";
    const ok = await this.dialogService.confirm(
      `\xBFQuitar "${cat.name}" de los porcentajes?${extra} Sus notas dejar\xE1n de contar en la nota final.`,
      "Quitar porcentaje"
    );
    if (!ok) return;
    this.categories = this.categories.filter((c) => c.id !== cat.id);
    this.gradeColumns = this.gradeColumns.filter((c) => c.cat !== cat.id);
    this.persistColumnConfig(true);
    this.cdr.markForCheck();
  }
  // ── "+" de la tabla: agregar una columna eligiendo un nombre ───────────
  toggleAddColumnMenu() {
    this.showAddColumnMenu = !this.showAddColumnMenu;
    this.cdr.markForCheck();
  }
  addColumnFromCategory(cat) {
    if (this.pctOver) {
      this.showAddColumnMenu = false;
      this.notifyPctOver();
      return;
    }
    const taken = /* @__PURE__ */ new Set([
      ...this.noteNames.map((n2) => n2.toLowerCase()),
      "nfinal",
      "n.final",
      ...this.gradeColumns.map((c) => c.name.toLowerCase())
    ]);
    let n = this.gradeColumns.filter((c) => c.cat === cat.id).length + 1;
    let key = `${cat.name}${n}`;
    while (taken.has(key.toLowerCase())) {
      n++;
      key = `${cat.name}${n}`;
    }
    this.gradeColumns = [...this.gradeColumns, {
      id: "col_" + Date.now() + "_" + Math.floor(Math.random() * 1e3),
      name: key,
      type: "ACTIVIDAD",
      kind: "col",
      cat: cat.id
    }];
    this.showAddColumnMenu = false;
    this.persistColumnConfig(true);
    this.cdr.markForCheck();
  }
  async removeColumn(col) {
    const ok = await this.dialogService.confirm(
      `\xBFQuitar la columna "${this.colHeader(col)}"? Sus notas dejar\xE1n de contar en la nota final.`,
      "Quitar columna"
    );
    if (!ok) return;
    this.gradeColumns = this.gradeColumns.filter((c) => c.id !== col.id);
    this.persistColumnConfig(true);
    this.cdr.markForCheck();
  }
  // ── Notas de las columnas dinámicas ──────────────────────────────────
  loadDynamicGradeValues() {
    if (!this.selectedGrade || !this.selectedClassroom || !this.selectedPeriod || this.students.length === 0) {
      this.markWeightsReady();
      return;
    }
    const teacherId = this.currentTeacherId();
    const subjectName = this.selectedSubject || this.teacherSubjectName || "";
    if (!teacherId || !subjectName) {
      this.markWeightsReady();
      return;
    }
    this.weightsReady = false;
    this.dynamicGradeValues = {};
    let pending = this.students.length;
    const done = () => {
      pending--;
      if (pending <= 0) this.markWeightsReady();
    };
    for (const student of this.students) {
      const url = `${API_ORIGIN}/api/grades/student/${student.id}/period/${this.selectedPeriod}`;
      this.http.get(url).subscribe({
        next: (grades) => {
          const forSubject = grades.filter(
            (g) => g.subjectName === subjectName && (this.selectedSubjectId == null || g.subjectId === this.selectedSubjectId) && (g.teacherId == null || g.teacherId === teacherId)
          );
          const values = {};
          for (const col of this.gradeColumns) {
            const match = forSubject.find((g) => g.gradeName === col.name);
            values[col.id] = match?.gradeValue ?? null;
          }
          this.dynamicGradeValues[student.id] = { ...values };
          this.cdr.markForCheck();
          done();
        },
        error: () => done()
      });
    }
  }
  getDynamicGradeValue(studentId, columnId) {
    return this.dynamicGradeValues[studentId]?.[columnId] ?? null;
  }
  getDynamicGradeDisplay(studentId, columnId) {
    const v = this.getDynamicGradeValue(studentId, columnId);
    return v === null ? "" : v.toString().replace(".", ",");
  }
  onDynamicGradeInput(studentId, column, event) {
    const input = event.target;
    let raw = input.value.replace(/\./g, ",");
    if (raw !== input.value) {
      input.value = raw;
    }
    const num = parseFloat(raw.replace(",", "."));
    const clamped = isNaN(num) ? null : Math.max(0, Math.min(5, num));
    if (!this.dynamicGradeValues[studentId]) this.dynamicGradeValues[studentId] = {};
    this.dynamicGradeValues[studentId] = { ...this.dynamicGradeValues[studentId], [column.id]: clamped };
    this.saveDynamicGrade(studentId, column, clamped);
  }
  saveDynamicGrade(studentId, column, value) {
    const teacherId = this.currentTeacherId();
    const subjectName = this.selectedSubject || this.teacherSubjectName;
    if (!teacherId || !subjectName || !this.selectedPeriod) return;
    const cacheKey = `${studentId}_${column.id}`;
    this.savingDynamicCell[cacheKey] = true;
    this.http.post("/api/grades", {
      studentId,
      subjectName,
      subjectId: this.selectedSubjectId,
      period: this.selectedPeriod,
      teacherId,
      gradeName: column.name,
      gradeValue: value
    }).subscribe({
      next: () => {
        this.savingDynamicCell[cacheKey] = false;
        this.saveNFinal(studentId);
        this.cdr.markForCheck();
      },
      error: () => {
        this.savingDynamicCell[cacheKey] = false;
        this.cdr.markForCheck();
      }
    });
  }
  columnsByType(type) {
    return this.gradeColumns.filter((c) => c.type === type);
  }
  loadData() {
    if (!this.selectedGrade || !this.selectedClassroom) return;
    const url = `${API_ORIGIN}/api/students/grade/${encodeURIComponent(this.selectedGrade)}/class/${encodeURIComponent(this.selectedClassroom)}`;
    this.http.get(url).subscribe({
      next: (students) => {
        this.students = students.sort((a, b) => (a.surname || "").localeCompare(b.surname || ""));
        this.recoveryData = {};
        for (const student of this.students) {
          this.recoveryData[student.id] = {};
        }
        this.loadGrades();
        this.loadRecoveryData();
        this.loadColumnConfig();
        this.cdr.markForCheck();
      },
      error: () => {
        this.students = [];
        this.isLoading = false;
        this.showLoadingScreen = false;
      }
    });
  }
  loadRecoveryData() {
    if (!this.selectedGrade || !this.selectedClassroom || !this.selectedPeriod || this.students.length === 0) return;
    const subjectName = this.selectedSubject || this.teacherSubjectName || "";
    if (!subjectName) return;
    const teacherId = this.getCurrentTeacherId();
    const keySuffix = this.selectedSubjectId != null ? this.selectedSubjectId : subjectName;
    const compositeKey = `${keySuffix}|${this.selectedPeriod}`;
    for (const student of this.students) {
      const subjectIdParam = this.selectedSubjectId != null ? `&subjectId=${this.selectedSubjectId}` : "";
      const url = `${API_ORIGIN}/api/grades/recovery/${student.id}?period=${this.selectedPeriod}${teacherId != null ? "&teacherId=" + teacherId : ""}&subjectName=${encodeURIComponent(subjectName)}${subjectIdParam}`;
      this.http.get(url).subscribe({
        next: (data) => {
          if (data && data.length > 0) {
            const rd = data[0];
            this.recoveryData[student.id][compositeKey] = {
              written: rd.recoveryWritten ?? null,
              oral: rd.recoveryOral ?? null,
              jInteg: rd.jInteg ?? null,
              compSocial: rd.compSocial ?? null,
              valoracionAcudiente: rd.valoracionAcudiente ?? null
            };
          }
          this.cdr.markForCheck();
        },
        error: () => {
        }
      });
    }
  }
  loadGrades() {
    if (!this.selectedGrade || !this.selectedClassroom || !this.selectedPeriod) return;
    this.gradesLoaded = false;
    this.gradesData = {};
    for (const student of this.students) {
      this.gradesData[student.id] = {
        1: null,
        2: null,
        3: null,
        4: null,
        5: null,
        6: null,
        7: null,
        8: null,
        9: null,
        10: null,
        11: null
      };
    }
    const subjectParam = this.selectedSubject ? `&subjectName=${encodeURIComponent(this.selectedSubject)}` : "";
    const subjectIdParam = this.selectedSubjectId != null ? `&subjectId=${this.selectedSubjectId}` : "";
    const url = `${API_ORIGIN}/api/grades/classroom?grade=${encodeURIComponent(this.selectedGrade)}&classroom=${encodeURIComponent(this.selectedClassroom)}&period=${this.selectedPeriod}${this.teacherIdParam()}${subjectParam}${subjectIdParam}`;
    this.http.get(url).subscribe({
      next: (response) => {
        if (response.grades && response.grades.length > 0) {
          const gradesMap = /* @__PURE__ */ new Map();
          for (const grade of response.grades) {
            let studentId = grade.studentId;
            if (!studentId && grade.student?.id) {
              studentId = grade.student.id;
            }
            if (!studentId) continue;
            let noteIndex = null;
            const gradeName = (grade.gradeName || "").trim().toLowerCase();
            if (grade.isEvaluation) {
              noteIndex = 8;
            } else if (gradeName === "auto.eval" || gradeName === "auto.eval." || gradeName === "autoeval") {
              noteIndex = 9;
            } else if (gradeName === "prom.parc" || gradeName === "prom.parc." || gradeName === "promedio parcial" || gradeName === "nota 10" || gradeName.includes("prom") && gradeName.includes("parc") || gradeName.includes("prom") && gradeName.length < 12) {
              noteIndex = 10;
            } else if (gradeName === "act1" || gradeName === "act01") {
              noteIndex = 1;
            } else if (gradeName === "act2" || gradeName === "act02") {
              noteIndex = 2;
            } else if (gradeName === "act3" || gradeName === "act03") {
              noteIndex = 3;
            } else if (gradeName === "act4" || gradeName === "act04") {
              noteIndex = 4;
            } else if (gradeName === "act5" || gradeName === "act05") {
              noteIndex = 5;
            } else if (gradeName === "act6" || gradeName === "act06") {
              noteIndex = 6;
            } else if (gradeName === "act7" || gradeName === "act07") {
              noteIndex = 7;
            } else if (gradeName === "nfinal" || gradeName === "n.final") {
              noteIndex = 11;
            }
            if (noteIndex === null) {
              continue;
            }
            const key = `${studentId}-${noteIndex}`;
            const existing = gradesMap.get(key);
            if (!existing || new Date(grade.updatedAt) > new Date(existing.updatedAt)) {
              gradesMap.set(key, { value: grade.gradeValue, updatedAt: grade.updatedAt });
            }
          }
          for (const [key, data] of gradesMap) {
            const [studentIdStr, noteIndexStr] = key.split("-");
            const studentId = parseInt(studentIdStr);
            const noteIndex = parseInt(noteIndexStr);
            if (!this.gradesData[studentId]) {
              this.gradesData[studentId] = {
                1: null,
                2: null,
                3: null,
                4: null,
                5: null,
                6: null,
                7: null,
                8: null,
                9: null,
                10: null,
                11: null
              };
            }
            this.gradesData[studentId][noteIndex] = data.value;
          }
        }
        this.isLoading = false;
        setTimeout(() => {
          this.showLoadingScreen = false;
        }, 300);
        this.gradesLoaded = true;
        if (this.weightsReady) this.saveAllNFinal();
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.showLoadingScreen = false;
      }
    });
  }
  getGrade(studentId, noteIndex) {
    if (!this.gradesData[studentId]) return null;
    const value = this.gradesData[studentId][noteIndex];
    return value !== void 0 && value !== null ? value : null;
  }
  isTeacher() {
    const user = this.authService.getCurrentUserValue();
    return !!(user && user.role && (user.role.name || user.role) === "TEACHER");
  }
  // Get display value for input (with comma as decimal separator)
  loadTeacherGradeRange() {
    const json = localStorage.getItem("selectedTeacherGradeRange");
    if (!json) {
      this.teacherGradeRange = null;
      this.grades = [...this.allGrades];
      return;
    }
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed.min === "number" && typeof parsed.max === "number" && parsed.min > 0 && parsed.max >= parsed.min) {
        this.teacherGradeRange = { min: parsed.min, max: parsed.max };
        this.grades = this.allGrades.filter((grade) => {
          const parsedGrade = this.parseGradeLabel(grade);
          return parsedGrade !== null && parsedGrade >= parsed.min && parsedGrade <= parsed.max;
        });
        if (this.selectedGrade && !this.grades.includes(this.selectedGrade)) {
          this.selectedGrade = null;
          this.selectedClassroom = null;
        }
        return;
      }
    } catch {
    }
    this.teacherGradeRange = null;
    this.grades = [...this.allGrades];
  }
  loadTeacherSubjectsForGradeRange() {
    const currentUser = this.authService.getCurrentUserValue();
    if (!currentUser || !currentUser.role) {
      this.hasTeacherGradeRange = false;
      return;
    }
    const roleName = currentUser.role.name || currentUser.role;
    if (roleName !== "TEACHER" || !currentUser.id) {
      this.hasTeacherGradeRange = false;
      return;
    }
    this.http.get(`${API_ORIGIN}/api/subjects/teacher/${currentUser.id}`).subscribe({
      next: (subjects) => {
        this.teacherSubjects = subjects;
        const chosen = subjects.find((s) => s.gradeMin != null && s.gradeMax != null) || subjects[0] || null;
        this.teacherSubjectName = chosen?.name ?? null;
        this.selectedSubject = chosen?.name ?? null;
        this.selectedSubjectId = chosen?.id ?? null;
        this.loadColumnConfig();
        setTimeout(() => {
          this.applyGradeFilterForSubject(chosen, false);
        }, 600);
        this.cdr.markForCheck();
      },
      error: () => {
        setTimeout(() => {
          this.teacherGradeRange = null;
          this.grades = [...this.allGrades];
          this.hasTeacherGradeRange = false;
          this.cdr.markForCheck();
        }, 600);
      }
    });
  }
  applyGradeFilterForSubject(subject, animate = true) {
    const subj = subject ?? this.teacherSubjects.find((s) => s.id === this.selectedSubjectId) ?? null;
    let newGrades = [];
    if (subj && subj.gradeMin != null && subj.gradeMax != null) {
      const minGrade = subj.gradeMin;
      const maxGrade = subj.gradeMax;
      newGrades = this.allGrades.filter((grade) => {
        const parsedGrade = this.parseGradeLabel(grade);
        return parsedGrade !== null && parsedGrade >= minGrade && parsedGrade <= maxGrade;
      });
      this.teacherGradeRange = { min: minGrade, max: maxGrade };
      this.hasTeacherGradeRange = true;
    } else {
      const withRange = this.teacherSubjects.filter((s) => s.gradeMin != null && s.gradeMax != null);
      if (withRange.length > 0) {
        const minGrade = Math.min(...withRange.map((s) => s.gradeMin));
        const maxGrade = Math.max(...withRange.map((s) => s.gradeMax));
        this.teacherGradeRange = { min: minGrade, max: maxGrade };
        newGrades = this.allGrades.filter((grade) => {
          const parsedGrade = this.parseGradeLabel(grade);
          return parsedGrade !== null && parsedGrade >= minGrade && parsedGrade <= maxGrade;
        });
        this.hasTeacherGradeRange = true;
      } else {
        this.teacherGradeRange = null;
        newGrades = [...this.allGrades];
        this.hasTeacherGradeRange = false;
      }
    }
    if (this.selectedGrade && !newGrades.includes(this.selectedGrade)) {
      this.selectedGrade = null;
      this.selectedClassroom = null;
    }
    if (!animate) {
      this.grades = newGrades;
      this.cdr.markForCheck();
      return;
    }
    const changed = !this.stringArraysEqual(this.grades, newGrades);
    if (!changed) return;
    this.isFadingOut = true;
    this.isFadingIn = false;
    setTimeout(() => {
      this.grades = newGrades;
      this.isFadingOut = false;
      this.isFadingIn = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.isFadingIn = false;
        this.cdr.markForCheck();
      }, 300);
    }, 300);
  }
  stringArraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  parseGradeLabel(grade) {
    const match = grade.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }
  getGradeDisplay(studentId, noteIndex) {
    const val = this.getGrade(studentId, noteIndex);
    if (val === null) return "";
    return val.toString().replace(".", ",");
  }
  // Etiqueta de la materia seleccionada, incluyendo el nivel (Primaria/Bachillerato)
  get selectedSubjectLabel() {
    const subj = this.teacherSubjects.find((s) => s.id === this.selectedSubjectId);
    const name = this.selectedSubject || this.teacherSubjectName || "MATEM\xC1TICAS";
    return subj?.level ? `${name} (${subj.level})` : name;
  }
  /** Promedio ponderado: grupo ACT + cada nombre del panel Porcentajes.
   *  Solo cuentan las que tienen nota; los pesos se reparten entre esas. */
  getWeightedActivityAverage(studentId) {
    let sum = 0;
    let weights = 0;
    const actPct = this.actPct ?? 0;
    if (actPct > 0) {
      const vals = [1, 2, 3, 4, 5, 6, 7].map((i) => this.getGrade(studentId, i)).filter((v) => v !== null);
      if (vals.length > 0) {
        sum += vals.reduce((a, b) => a + b, 0) / vals.length * actPct;
        weights += actPct;
      }
    }
    for (const cat of this.categories) {
      const pct = cat.pct ?? 0;
      if (pct <= 0) continue;
      const vals = this.gradeColumns.filter((c) => c.cat === cat.id).map((c) => this.getDynamicGradeValue(studentId, c.id)).filter((v) => v !== null);
      if (vals.length > 0) {
        sum += vals.reduce((a, b) => a + b, 0) / vals.length * pct;
        weights += pct;
      }
    }
    return weights > 0 ? sum / weights : null;
  }
  // Actividades = promedio * (100 - % de Eval.Period) / 100. Si el profesor puso porcentajes,
  // el promedio es ponderado; si no, es el promedio simple de siempre.
  get80Percent(studentId) {
    if (this.weightedMode) {
      const w = this.getWeightedActivityAverage(studentId);
      if (w === null) return "-";
      return (w * (this.activitiesShare / 100)).toFixed(2).replace(".", ",");
    }
    const grades = [
      this.getGrade(studentId, 1),
      this.getGrade(studentId, 2),
      this.getGrade(studentId, 3),
      this.getGrade(studentId, 4),
      this.getGrade(studentId, 5),
      this.getGrade(studentId, 6),
      this.getGrade(studentId, 7),
      this.getGrade(studentId, 9),
      // Auto.Eval
      this.getGrade(studentId, 10)
      // Prom.Parc
    ].filter((v) => v !== null);
    if (grades.length === 0) return "-";
    const sum = grades.reduce((a, b) => a + b, 0);
    const avg = sum / grades.length;
    const result = avg * (this.activitiesShare / 100);
    return result.toFixed(2).replace(".", ",");
  }
  // Get the numeric value for 80%
  get80PercentValue(studentId) {
    const str = this.get80Percent(studentId);
    if (str === "-") return null;
    return parseFloat(str.replace(",", "."));
  }
  // Eval.Period × su porcentaje (20% por defecto, editable)
  get20Percent(studentId) {
    const ev = this.getGrade(studentId, 8);
    if (ev === null) return "-";
    const result = ev * (this.evalPct / 100);
    return result.toFixed(2).replace(".", ",");
  }
  // Get numeric value for 20%
  get20PercentValue(studentId) {
    const str = this.get20Percent(studentId);
    if (str === "-") return null;
    return parseFloat(str.replace(",", "."));
  }
  // Auto.Eval - promedio de todas las actividades
  getAutoEval(studentId) {
    const grades = [
      this.getGrade(studentId, 1),
      this.getGrade(studentId, 2),
      this.getGrade(studentId, 3),
      this.getGrade(studentId, 4),
      this.getGrade(studentId, 5),
      this.getGrade(studentId, 6),
      this.getGrade(studentId, 7)
    ].filter((v) => v !== null);
    if (grades.length === 0) return "-";
    const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
    return avg.toFixed(2).replace(".", ",");
  }
  // Get numeric value
  getAutoEvalValue(studentId) {
    const str = this.getAutoEval(studentId);
    if (str === "-") return null;
    return parseFloat(str.replace(",", "."));
  }
  getAutoEvalColor(studentId) {
    const val = this.getAutoEvalValue(studentId);
    if (val === null) return "";
    return this.getGradeColor(val);
  }
  // Prom.Parc - promedio parcial (igual que Auto.Eval)
  getPromParc(studentId) {
    return this.getAutoEval(studentId);
  }
  getPromParcValue(studentId) {
    return this.getAutoEvalValue(studentId);
  }
  getPromParcColor(studentId) {
    return this.getAutoEvalColor(studentId);
  }
  // Nota final = usar valor guardado en DB si existe, si no calcular 80% + 20%
  getFinal(studentId) {
    const savedNFinal = this.getGrade(studentId, 11);
    if (savedNFinal !== null) {
      return savedNFinal.toFixed(1).replace(".", ",");
    }
    const p80 = this.get80PercentValue(studentId);
    const p20 = this.get20PercentValue(studentId);
    if (p80 === null && p20 === null) return "-";
    const finalGrade = (p80 ?? 0) + (p20 ?? 0);
    return finalGrade.toFixed(1).replace(".", ",");
  }
  // Get numeric final grade
  getFinalValue(studentId) {
    const savedNFinal = this.getGrade(studentId, 11);
    if (savedNFinal !== null) return savedNFinal;
    const str = this.getFinal(studentId);
    if (str === "-") return null;
    return parseFloat(str.replace(",", "."));
  }
  // Nota Recuperación = (Recup.Escrita + Recup.Oral) / 2
  getNotaRecup(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const written = rd.written;
    const oral = rd.oral;
    if (written === null && oral === null) return "-";
    if (written === null || oral === null) {
      return (written ?? oral ?? "-").toString().replace(".", ",");
    }
    const result = (written + oral) / 2;
    return result.toFixed(2).replace(".", ",");
  }
  getNotaRecupValue(studentId) {
    const str = this.getNotaRecup(studentId);
    if (str === "-") return null;
    return parseFloat(str.replace(",", "."));
  }
  // Get final grade considering recovery
  getFinalWithRecovery(studentId) {
    const nFinal = this.getFinalValue(studentId);
    const notaRecup = this.getNotaRecupValue(studentId);
    if (nFinal === null) return "-";
    if (notaRecup !== null && notaRecup > nFinal) {
      return notaRecup.toFixed(2).replace(".", ",");
    }
    return nFinal.toFixed(2).replace(".", ",");
  }
  // Get final value with recovery
  getFinalWithRecoveryValue(studentId) {
    const str = this.getFinalWithRecovery(studentId);
    if (str === "-") return null;
    return parseFloat(str.replace(",", "."));
  }
  // Check if student needs recovery (final < nota mínima configurada)
  needsRecovery(studentId) {
    const final = this.getFinalValue(studentId);
    return final !== null && final < this.minPassingGrade;
  }
  // Check if student is in yellow range (nota mínima <= final < 4.0) - yellow highlight
  isLosing(studentId) {
    const final = this.getFinalWithRecoveryValue(studentId);
    return final !== null && final >= this.minPassingGrade && final < 4;
  }
  // Check if student has excellent grade (final >= 4.0) - green highlight
  hasExcellentGrade(studentId) {
    const final = this.getFinalWithRecoveryValue(studentId);
    return final !== null && final >= 4;
  }
  // Comp Social: escala E=4.6-5.0, S=4.0-4.5, B=3.5-3.9, A=3.0-3.4, I=1.0-2.9
  getCompSocialDisplay(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const val = rd.compSocial;
    if (!val) return "-";
    const num = parseFloat(val);
    if (isNaN(num)) return "-";
    return num.toFixed(1);
  }
  getCompSocialLabel(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const val = rd.compSocial;
    if (!val) return "-";
    const num = parseFloat(val);
    if (isNaN(num)) return "-";
    if (num >= 4.6) return "Excelente";
    if (num >= 4) return "Sobresaliente";
    if (num >= 3.5) return "Bueno";
    if (num >= 3) return "Aceptable";
    if (num >= 1) return "Insuficiente";
    return String(num);
  }
  getCompSocialScaleLabel(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const val = rd.compSocial;
    if (!val) return "";
    const num = parseFloat(val);
    if (isNaN(num)) return "";
    if (num >= 4.6) return "Excelente";
    if (num >= 4) return "Sobresaliente";
    if (num >= 3.5) return "Bueno";
    if (num >= 3) return "Aceptable";
    if (num >= 1) return "Insuficiente";
    return "";
  }
  getCompSocialColor(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const val = rd.compSocial;
    if (!val) return "";
    const num = parseFloat(val);
    if (isNaN(num)) return "";
    if (num >= 4) return "comp-social-green";
    if (num >= 3.5) return "comp-social-blue";
    if (num >= 3) return "comp-social-yellow";
    if (num >= 1) return "comp-social-red";
    return "";
  }
  // Valoración Acudiente: misma escala institucional de 5 niveles que
  // Comportamiento Social — E=4.6-5.0, S=4.0-4.5, B=3.5-3.9, A=3.0-3.4,
  // I=1.0-2.9.
  getValoracionAcudienteDisplay(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const val = rd.valoracionAcudiente;
    if (!val) return "-";
    const num = parseFloat(val);
    if (isNaN(num)) return "-";
    return num.toFixed(1);
  }
  getValoracionAcudienteLabel(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const val = rd.valoracionAcudiente;
    if (!val) return "-";
    const num = parseFloat(val);
    if (isNaN(num)) return "-";
    if (num >= 4.6) return "Excelente";
    if (num >= 4) return "Sobresaliente";
    if (num >= 3.5) return "Bueno";
    if (num >= 3) return "Aceptable";
    if (num >= 1) return "Insuficiente";
    return String(num);
  }
  getValoracionAcudienteScaleLabel(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const val = rd.valoracionAcudiente;
    if (!val) return "";
    const num = parseFloat(val);
    if (isNaN(num)) return "";
    if (num >= 4.6) return "Excelente (4,6 \u2013 5,0)";
    if (num >= 4) return "Sobresaliente (4,0 \u2013 4,5)";
    if (num >= 3.5) return "Bueno (3,5 \u2013 3,9)";
    if (num >= 3) return "Aceptable (3,0 \u2013 3,4)";
    if (num >= 1) return "Insuficiente (1,0 \u2013 2,9)";
    return "";
  }
  getValoracionAcudienteColor(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    const val = rd.valoracionAcudiente;
    if (!val) return "";
    const num = parseFloat(val);
    if (isNaN(num)) return "";
    if (num >= 4) return "comp-social-green";
    if (num >= 3.5) return "comp-social-blue";
    if (num >= 3) return "comp-social-yellow";
    if (num >= 1) return "comp-social-red";
    return "";
  }
  getCurrentSubjectKey() {
    const subject = this.selectedSubject || this.teacherSubjectName || "";
    if (!subject && this.selectedSubjectId == null) return "";
    const key = this.selectedSubjectId != null ? this.selectedSubjectId : subject;
    return `${key}|${this.selectedPeriod}`;
  }
  ensureRecoveryData(studentId, subjectKey) {
    if (!this.recoveryData[studentId]) {
      this.recoveryData[studentId] = {};
    }
    if (!this.recoveryData[studentId][subjectKey]) {
      this.recoveryData[studentId][subjectKey] = { written: null, oral: null, jInteg: null, compSocial: null, valoracionAcudiente: null };
    }
    return this.recoveryData[studentId][subjectKey];
  }
  getCurrentSubjectRecoveryData(studentId) {
    const key = this.getCurrentSubjectKey();
    if (!key) return { written: null, oral: null, jInteg: null, compSocial: null, valoracionAcudiente: null };
    if (!this.recoveryData[studentId]) return { written: null, oral: null, jInteg: null, compSocial: null, valoracionAcudiente: null };
    return this.recoveryData[studentId][key] || { written: null, oral: null, jInteg: null, compSocial: null, valoracionAcudiente: null };
  }
  // Get color class based on grade
  getGradeColor(grade) {
    if (grade === null) return "";
    if (grade >= 4) return "grade-green";
    if (grade >= this.minPassingGrade) return "grade-yellow";
    return "grade-red";
  }
  get80Color(studentId) {
    const val = this.get80PercentValue(studentId);
    if (val === null) return "";
    return this.getGradeColor(val);
  }
  get20Color(studentId) {
    const val = this.get20PercentValue(studentId);
    if (val === null) return "";
    return this.getGradeColor(val);
  }
  getFinalColor(studentId) {
    const val = this.getFinalWithRecoveryValue(studentId);
    if (val === null) return "";
    return this.getGradeColor(val);
  }
  // Handle input change - auto save on typing
  onGradeChange(studentId, noteIndex, event) {
    const input = event.target;
    let value = input.value.trim();
    if (value === "" || value === "-" || value === "," || value === ".") {
      if (!this.gradesData[studentId]) this.gradesData[studentId] = {};
      this.gradesData[studentId][noteIndex] = null;
      this.saveGrade(studentId, noteIndex, null);
      return;
    }
    value = value.replace(",", ".");
    if (value.endsWith(".")) {
      return;
    }
    let numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return;
    }
    numValue = Math.max(0, Math.min(5, numValue));
    numValue = Math.round(numValue * 100) / 100;
    if (!this.gradesData[studentId]) this.gradesData[studentId] = {};
    this.gradesData[studentId][noteIndex] = numValue;
    input.value = numValue.toString();
    this.saveGrade(studentId, noteIndex, numValue);
  }
  // Handle click to save
  onGradeClick(studentId, noteIndex, event) {
    const input = event.target;
    let value = input.value.trim();
    if (noteIndex === 5) {
      const rd = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
      rd.jInteg = value;
      this.saveRecoveryData(studentId);
      return;
    }
    if (value === "" || value === "-" || value === "," || value === ".") {
      return;
    }
    value = value.replace(",", ".");
    let numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    numValue = Math.max(0, Math.min(5, numValue));
    numValue = Math.round(numValue * 100) / 100;
    if (noteIndex >= 1 && noteIndex <= 10) {
      if (!this.gradesData[studentId]) this.gradesData[studentId] = {};
      this.gradesData[studentId][noteIndex] = numValue;
      input.value = numValue.toString().replace(".", ",");
      this.saveGrade(studentId, noteIndex, numValue);
    }
  }
  // Handle blur - format the display value
  onGradeBlur(studentId, noteIndex, event) {
    const input = event.target;
    const value = input.value.trim();
    if (value === "" || value === "-" || value === ",") {
      if (!this.gradesData[studentId]) this.gradesData[studentId] = {};
      this.gradesData[studentId][noteIndex] = null;
      input.value = "";
      this.saveGrade(studentId, noteIndex, null);
      this.saveNFinal(studentId);
      this.focusedCell = null;
      return;
    }
    let numValue = parseFloat(value.replace(",", "."));
    if (isNaN(numValue)) {
      input.value = "";
      this.focusedCell = null;
      return;
    }
    numValue = Math.max(0, Math.min(5, numValue));
    numValue = Math.round(numValue * 100) / 100;
    input.value = numValue.toString().replace(".", ",");
    if (!this.gradesData[studentId]) this.gradesData[studentId] = {};
    this.gradesData[studentId][noteIndex] = numValue;
    this.saveGrade(studentId, noteIndex, numValue);
    this.saveNFinal(studentId);
    this.focusedCell = null;
  }
  // Recovery data handlers
  onRecoveryWrittenChange(studentId, event) {
    const input = event.target;
    let value = input.value.trim();
    if (value === "" || value === "-" || value === "," || value === ".") {
      const rd2 = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
      rd2.written = null;
      this.saveRecoveryData(studentId);
      return;
    }
    value = value.replace(",", ".");
    let numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    numValue = Math.max(0, Math.min(5, numValue));
    numValue = Math.round(numValue * 100) / 100;
    const rd = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
    rd.written = numValue;
    input.value = numValue.toString().replace(".", ",");
    this.saveRecoveryData(studentId);
  }
  onRecoveryOralChange(studentId, event) {
    const input = event.target;
    let value = input.value.trim();
    if (value === "" || value === "-" || value === "," || value === ".") {
      const rd2 = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
      rd2.oral = null;
      this.saveRecoveryData(studentId);
      return;
    }
    value = value.replace(",", ".");
    let numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    numValue = Math.max(0, Math.min(5, numValue));
    numValue = Math.round(numValue * 100) / 100;
    const rd = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
    rd.oral = numValue;
    input.value = numValue.toString().replace(".", ",");
    this.saveRecoveryData(studentId);
  }
  onJIntegChange(studentId, event) {
    const input = event.target;
    const value = input.value.trim();
    const rd = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
    rd.jInteg = value;
    this.saveRecoveryData(studentId);
  }
  onCompSocialChange(studentId, event) {
    const input = event.target;
    const value = input.value.trim().replace(",", ".");
    if (!value) {
      const rd2 = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
      rd2.compSocial = null;
      this.saveRecoveryData(studentId);
      return;
    }
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    const rd = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
    rd.compSocial = String(num);
    this.saveRecoveryData(studentId);
  }
  onValoracionAcudienteChange(studentId, event) {
    const input = event.target;
    const value = input.value.trim().replace(",", ".");
    if (!value) {
      const rd2 = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
      rd2.valoracionAcudiente = null;
      this.saveRecoveryData(studentId);
      return;
    }
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    const rd = this.ensureRecoveryData(studentId, this.getCurrentSubjectKey());
    rd.valoracionAcudiente = String(num);
    this.saveRecoveryData(studentId);
  }
  saveGrade(studentId, noteIndex, value, appreciativeValue) {
    this.queueGradeSave(studentId, noteIndex, value);
  }
  queueGradeSave(studentId, noteIndex, value) {
    const key = `${studentId}-${noteIndex}`;
    this.gradeSaveLast.set(key, { studentId, noteIndex, value });
    this.gradeSaveQueue.set(key, { studentId, noteIndex, value });
    if (this.gradeSaveTimers.has(key)) {
      clearTimeout(this.gradeSaveTimers.get(key));
      this.gradeSaveTimers.delete(key);
    }
    this.gradeSaveTimers.set(key, setTimeout(() => this.flushGradeKey(key), 300));
  }
  flushGradeKey(key) {
    if (this.gradeSaveTimers.has(key)) {
      clearTimeout(this.gradeSaveTimers.get(key));
      this.gradeSaveTimers.delete(key);
    }
    const item = this.gradeSaveQueue.get(key);
    if (!item) return;
    if (this.gradeSaveInFlight.has(key)) return;
    this.gradeSaveInFlight.add(key);
    this.gradeSaveQueue.delete(key);
    this.persistGradeSave(item.studentId, item.noteIndex, item.value);
  }
  persistGradeSave(studentId, noteIndex, value) {
    const gradeName = this.noteNames[noteIndex - 1] || `Nota ${noteIndex}`;
    const data = {
      studentId,
      subjectName: this.selectedSubject || this.teacherSubjectName || "MATEMATICAS",
      subjectId: this.selectedSubjectId,
      period: this.selectedPeriod,
      gradeName,
      isEvaluation: noteIndex === 8,
      teacherId: this.getCurrentTeacherId()
    };
    data.gradeValue = value;
    data.appreciative = "";
    this.http.post("/api/grades", data).subscribe({
      next: () => {
        if (!this.gradesData[studentId]) {
          this.gradesData[studentId] = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null, 9: null, 10: null, 11: null };
        }
        this.gradesData[studentId][noteIndex] = value;
        this.gradesUpdateService.notifyGradeUpdate();
        this.cdr.markForCheck();
        this.afterGradeSave(`${studentId}-${noteIndex}`);
      },
      error: (err) => {
        console.error("Error saving grade:", err);
        this.afterGradeSave(`${studentId}-${noteIndex}`);
      }
    });
  }
  afterGradeSave(key) {
    this.gradeSaveInFlight.delete(key);
    this.gradeSaveLast.delete(key);
    if (this.gradeSaveQueue.has(key)) {
      this.flushGradeKey(key);
    } else if (this.gradeSaveInFlight.size === 0 && this.gradeSaveQueue.size === 0 && this.recoverySaveInFlight.size === 0) {
      const waiters = this.flushWaiters;
      this.flushWaiters = [];
      waiters.forEach((w) => w());
    }
  }
  flushSaves() {
    this.flushColumnConfig();
    for (const key of Array.from(this.gradeSaveTimers.keys())) {
      this.flushGradeKey(key);
    }
    for (const sid of Array.from(this.recoverySaveTimers.keys())) {
      this.flushRecoveryKey(sid);
    }
    if (this.gradeSaveInFlight.size === 0 && this.gradeSaveQueue.size === 0 && this.recoverySaveInFlight.size === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.flushWaiters.push(resolve));
  }
  saveNFinal(studentId) {
    if (!this.weightsReady || this.pctOver) return;
    const p80 = this.get80PercentValue(studentId);
    const p20 = this.get20PercentValue(studentId);
    let finalGrade = null;
    if (p80 !== null || p20 !== null) {
      finalGrade = (p80 ?? 0) + (p20 ?? 0);
    }
    const data = {
      studentId,
      subjectName: this.selectedSubject || this.teacherSubjectName || "MATEMATICAS",
      subjectId: this.selectedSubjectId,
      period: this.selectedPeriod,
      gradeName: "nFinal",
      isEvaluation: false,
      teacherId: this.getCurrentTeacherId()
    };
    data.gradeValue = finalGrade;
    data.appreciative = "";
    this.http.post("/api/grades", data).subscribe({
      next: (response) => {
        if (!this.gradesData[studentId]) {
          this.gradesData[studentId] = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null, 9: null, 10: null, 11: null };
        }
        this.gradesData[studentId][11] = finalGrade;
        this.cdr.markForCheck();
      },
      error: (err) => console.error("Error saving nFinal:", err)
    });
  }
  saveRecoveryData(studentId) {
    const rd = this.getCurrentSubjectRecoveryData(studentId);
    if (!rd) return;
    const key = String(studentId);
    this.recoveryLast.set(key, {
      studentId,
      subjectName: this.selectedSubject || this.teacherSubjectName || "MATEMATICAS",
      subjectId: this.selectedSubjectId,
      period: this.selectedPeriod,
      recoveryWritten: rd.written,
      recoveryOral: rd.oral,
      jInteg: rd.jInteg,
      compSocial: rd.compSocial,
      valoracionAcudiente: rd.valoracionAcudiente,
      teacherId: this.getCurrentTeacherId()
    });
    if (this.recoverySaveTimers.has(key)) {
      clearTimeout(this.recoverySaveTimers.get(key));
      this.recoverySaveTimers.delete(key);
    }
    this.recoverySaveTimers.set(key, setTimeout(() => this.flushRecoveryKey(key), 300));
  }
  flushRecoveryKey(key) {
    if (this.recoverySaveTimers.has(key)) {
      clearTimeout(this.recoverySaveTimers.get(key));
      this.recoverySaveTimers.delete(key);
    }
    const payload = this.recoveryLast.get(key);
    if (!payload) return;
    if (this.recoverySaveInFlight.has(key)) return;
    this.recoverySaveInFlight.add(key);
    this.http.post("/api/grades/recovery", payload).subscribe({
      next: () => this.afterRecoverySave(key),
      error: (err) => {
        console.error("Error saving recovery data:", err);
        this.afterRecoverySave(key);
      }
    });
  }
  afterRecoverySave(key) {
    this.recoverySaveInFlight.delete(key);
    this.recoveryLast.delete(key);
    if (this.gradeSaveInFlight.size === 0 && this.gradeSaveQueue.size === 0 && this.recoverySaveInFlight.size === 0) {
      const waiters = this.flushWaiters;
      this.flushWaiters = [];
      waiters.forEach((w) => w());
    }
  }
  // YouTube video cache to avoid re-checking same videos
  youtubeVideoCache = /* @__PURE__ */ new Map();
  // AI Study Plan functions
  openStudyPlanModal(student) {
    this.selectedStudentForPlan = student;
    this.studyPlanTopics = "";
    this.studyPlanContent = "";
    this.studyPlanContentSafe = null;
    this.progressPercent = 0;
    this.showProgressBar = false;
    this.planGenerated = false;
    this.planSaved = false;
    this.youtubeVideoCache.clear();
    this.showStudyPlanModal = true;
  }
  // Filter out unavailable videos from the HTML content
  async filterUnavailableVideos(html) {
    const videoCardRegex = /<div class="video-card">[\s\S]*?<\/div>/gi;
    const videoCards = html.match(videoCardRegex) || [];
    const videoUrlRegex = /href="([^"]+)"/;
    const titleRegex = /<a[^>]*class="video-link"[^>]*>([^<]+)<\/a>/;
    const availableVideos = [];
    for (const card of videoCards) {
      const urlMatch = card.match(videoUrlRegex);
      const titleMatch = card.match(titleRegex);
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1];
        const title = titleMatch ? titleMatch[1] : url;
        const isAvailable = await this.checkVideoAvailability(url);
        if (isAvailable) {
          availableVideos.push({ title, url, html: card });
        }
      }
    }
    if (availableVideos.length === 0) {
      return html.replace(
        /<div class="video-section">[\s\S]*?<\/div>\s*<div class="activities-section">([\s\S]*?)<\/div><\/div>/gi,
        '<div class="activities-section">$1</div></div>'
      );
    }
    let newVideoSection = '<div class="video-section">';
    availableVideos.forEach((v) => {
      newVideoSection += v.html;
    });
    newVideoSection += "</div>";
    return html.replace(/<div class="video-section">[\s\S]*?<\/div>/, newVideoSection);
  }
  onCellFocus(studentId, noteIndex) {
    this.focusedCell = { studentId, noteIndex };
  }
  updateNoteName(index, name) {
    this.noteNames[index] = name;
  }
  combineMathParagraphs(html) {
    const operators = ["\xD7", "\\times", "\\cdot", "\\div", "\\pm", "\\mp", "=", "+", "-", "\u22C5", "/", "\xB7", "*", "\xB7"];
    const operatorPattern = operators.map((op) => op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    let prev;
    let current = html;
    do {
      prev = current;
      current = current.replace(new RegExp(`<div class="paragraph-block"><p>([\\s\\S]*?\\$[\\s\\S]*?\\$[\\s\\S]*?)<\\/p><\\/div>\\s*<div class="paragraph-block"><p>\\s*(${operatorPattern}|[+\\-\xD7\xF7=*\xB7])\\s*<\\/p><\\/div>\\s*<div class="paragraph-block"><p>([\\s\\S]*?\\$[\\s\\S]*?\\$[\\s\\S]*?)<\\/p><\\/div>`, "g"), (match, content1, op, content3) => `<div class="paragraph-block"><p>${content1} ${op} ${content3}</p></div>`);
      current = current.replace(new RegExp(`(<p>[\\s\\S]*?\\$[\\s\\S]*?\\$[\\s\\S]*?<\\/p>)\\s*<p>\\s*(${operatorPattern}|[+\\-\xD7\xF7=*\xB7])\\s*<\\/p>\\s*(<p>[\\s\\S]*?\\$[\\s\\S]*?\\$[\\s\\S]*?<\\/p>)`, "g"), (match, p1, op, p3) => {
        const content1 = p1.replace(/^<p>/, "").replace(/<\/p>$/, "");
        const content3 = p3.replace(/^<p>/, "").replace(/<\/p>$/, "");
        return `<p>${content1} ${op} ${content3}</p>`;
      });
      current = current.replace(/(\$[^\$]+\$)\s*(?:<br\s*\/?>\s*)+(\$[^\$]+\$)/gi, (match, f1, f2) => `${f1} \\cdot ${f2}`);
    } while (current !== prev);
    current = current.replace(/(?:<p>\s*\$[\s\S]*?\$\s*<\/p>\s*){2,}/gi, (match) => match.replace(/<\/p>\s*<p>/gi, " "));
    current = current.replace(/(?:<div class="paragraph-block"><p>\s*\$[\s\S]*?\$\s*<\/p><\/div>\s*){2,}/gi, (match) => match.replace(/<\/p><\/div>\s*<div class="paragraph-block"><p>/gi, " "));
    return current;
  }
  /** Fuerza que el plan de estudio sea de un único día: recorta cualquier
   *  sección "DÍA 2" (o posterior) que la IA haya generado. */
  keepOnlyDayOne(html) {
    if (!html) return html;
    const day2 = html.match(/<h[1-4][^>]*>\s*(?:d[ií]a)\s*2\b[\s\S]*?(?=<h[1-4]|$)/i);
    if (day2 && day2.index !== void 0) {
      html = html.substring(0, day2.index) + html.substring(day2.index + day2[0].length);
    }
    html = html.replace(/<h[1-4][^>]*>\s*(?:d[ií]a)\s*[3-9]\b[\s\S]*?(?=<h[1-4]|$)/gi, "");
    return html;
  }
  renderMathExpressions() {
    const planContent = document.getElementById("study-plan-content");
    if (!planContent) return;
    const waitForKatex = (callback, maxAttempts = 50) => {
      let attempts = 0;
      const check = () => {
        attempts++;
        const katexAny = window.katex;
        const hasAutoRender = typeof window.renderMathInElement === "function";
        if (katexAny && typeof katexAny.ParseError !== "undefined" && hasAutoRender) callback();
        else if (attempts < maxAttempts) setTimeout(check, 100);
        else console.warn("[StudyPlan] KaTeX no se carg\xF3 tras " + maxAttempts * 100 + "ms");
      };
      check();
    };
    try {
      this.mergeMathParagraphs(planContent);
    } catch (e) {
      console.warn("[StudyPlan] mergeMathParagraphs fall\xF3", e);
    }
    waitForKatex(() => {
      try {
        if (typeof window.renderMathInElement === "function") {
          window.renderMathInElement(planContent, {
            delimiters: [
              { left: "$$", right: "$$", display: false },
              { left: "$", right: "$", display: false }
            ],
            throwOnError: false,
            trust: true,
            strict: false
          });
        }
        planContent.querySelectorAll(".katex-display").forEach((el) => {
          const html = el.innerHTML || "";
          if (html.includes("mfrac") || html.includes("\\frac")) {
            el.classList.add("inline-only");
          }
        });
      } catch (e) {
        console.warn("[StudyPlan] KaTeX render fall\xF3", e);
        this.fallbackMathToReadable(planContent);
      }
    });
    setTimeout(() => {
      const renderedCount = planContent.querySelectorAll(".katex").length;
      if (renderedCount === 0 && /\$\$?[^$]+\$\$?/.test(planContent.textContent || "")) {
        console.warn("[StudyPlan] KaTeX no pint\xF3 nada, aplicando fallback visible");
        this.fallbackMathToReadable(planContent);
      }
    }, 5500);
  }
  /**
   * Fallback visible cuando KaTeX no carga: convierte los tramos $...$ en
   * texto en cursiva y les aplica un color destacado. No es renderizado
   * matemático real, pero al menos deja legible la fórmula y elimina los
   * delimitadores $ que rompen la lectura del texto.
   */
  fallbackMathToReadable(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let node;
    while (node = walker.nextNode()) {
      const t = node;
      if (!t.parentElement || t.parentElement.tagName === "SCRIPT" || t.parentElement.tagName === "STYLE") continue;
      if (/\$[^$]+\$/.test(t.nodeValue || "")) targets.push(t);
    }
    for (const t of targets) {
      const frag = document.createDocumentFragment();
      const parts = (t.nodeValue || "").split(/(\$[^$]+\$)/g);
      for (const part of parts) {
        if (!part) continue;
        if (/^\$[^$]+\$$/.test(part)) {
          const span = document.createElement("span");
          span.className = "math-fallback";
          span.textContent = part.slice(1, -1);
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      }
      t.parentNode?.replaceChild(frag, t);
    }
  }
  /** Une en un solo párrafo los <p> adyacentes que contienen fórmulas KaTeX,
   *  de modo que las ecuaciones se muestren en línea y no una debajo de otra. */
  mergeMathParagraphs(container) {
    const hasKatex = (el) => !!el.querySelector(".katex, .katex-display, .mjx-container");
    const paragraphs = Array.from(container.querySelectorAll("p"));
    for (let i = 0; i < paragraphs.length - 1; i++) {
      const p = paragraphs[i];
      const next = paragraphs[i + 1];
      if (hasKatex(p) || hasKatex(next)) {
        const left = (p.textContent || "").trim();
        const endsWithTag = (p.innerHTML || "").trim().endsWith(">");
        const sep = endsWithTag ? "" : left ? " " : "";
        p.innerHTML = (p.innerHTML || "") + sep + (next.innerHTML || "");
        next.remove();
        paragraphs.splice(i + 1, 1);
        i--;
      }
    }
  }
  // Check if a YouTube/Khan Academy video URL is available
  async checkVideoAvailability(url) {
    if (this.youtubeVideoCache.has(url)) {
      return this.youtubeVideoCache.get(url);
    }
    let timeout;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 5e3);
      const videoId = this.extractYouTubeId(url);
      if (videoId) {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
          method: "HEAD",
          mode: "no-cors",
          signal: controller.signal
        });
        clearTimeout(timeout);
        this.youtubeVideoCache.set(url, true);
        return true;
      }
      if (url.includes("khanacademy.org")) {
        try {
          const khanResponse = await fetch(url, {
            method: "HEAD",
            mode: "no-cors",
            signal: controller.signal
          });
          clearTimeout(timeout);
          this.youtubeVideoCache.set(url, true);
          return true;
        } catch (e) {
          clearTimeout(timeout);
          this.youtubeVideoCache.set(url, false);
          return false;
        }
      }
      this.youtubeVideoCache.set(url, true);
      return true;
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      this.youtubeVideoCache.set(url, false);
      return false;
    }
  }
  // Extract YouTube video ID from URL
  extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  }
  // Filter videos to only show available ones
  async filterAvailableVideos(videos) {
    const availableVideos = [];
    for (const video of videos) {
      const isAvailable = await this.checkVideoAvailability(video.url);
      if (isAvailable) {
        availableVideos.push(video);
      }
    }
    return availableVideos;
  }
  loadExistingPlan(studentId, period) {
    this.http.get(`${API_ORIGIN}/api/grades/study-plans/${studentId}${this.teacherIdQuery()}`).subscribe({
      next: (plans) => {
        const plan = plans.find((p) => p.period === period);
        if (plan) {
          this.studyPlanTopics = plan.topics || "";
          let content = plan.planContent || "";
          if (!content.includes("<") && content.includes("$")) {
            content = this.convertMarkdownToHtml(content);
          }
          this.studyPlanContent = this.keepOnlyDayOne(this.combineMathParagraphs(content));
          this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(this.studyPlanContent);
          this.planGenerated = true;
          this.planSaved = true;
          this.showProgressBar = false;
          this.progressPercent = 100;
          setTimeout(() => this.renderMathExpressions(), 100);
          if (!this.generatedPlans[studentId]) {
            this.generatedPlans[studentId] = {};
          }
          this.generatedPlans[studentId][period] = true;
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        console.error("Error loading existing plan:", err);
        this.studyPlanContent = "Error al cargar el plan existente.";
        this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(this.studyPlanContent);
        this.planGenerated = true;
      }
    });
  }
  closeStudyPlanModal() {
    this.showStudyPlanModal = false;
    this.selectedStudentForPlan = null;
    this.studyPlanTopics = "";
    this.studyPlanContent = "";
    this.extractedImages = [];
    this.uploadedImages = [];
  }
  onImageSelected(event) {
    const input = event.target;
    if (input.files) {
      const files = Array.from(input.files);
      files.forEach((file) => {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result;
            this.uploadedImages.push({
              file,
              preview: result,
              base64: result.split(",")[1]
            });
          };
          reader.readAsDataURL(file);
        }
      });
    }
    input.value = "";
  }
  removeImage(index) {
    this.uploadedImages = this.uploadedImages.filter((_, i) => i !== index);
  }
  onImageError(index) {
    this.extractedImages = this.extractedImages.filter((_, i) => i !== index);
  }
  sanitizeAiText(text) {
    let result = text.replace(/^```[a-zA-Z0-9]*\s*\n?/i, "").replace(/\n?```\s*$/i, "").replace(/^[ \t]*```[a-zA-Z0-9]*[ \t]*$/gim, "").replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, "");
    result = result.replace(/\f/g, "\\");
    result = result.replace(/\r\n/g, "\n").replace(/<[\w-]+_details>[\s\S]*?<\/[\w-]+_details>/gi, "").replace(/^Current time:.*$/gim, "").replace(/^Active file:.*$/gim, "").replace(/^Visible files:.*$/gim, "").replace(/^Open tabs:.*$/gim, "").replace(/^src\/main\/java\/.*$/gim, "").replace(/^Frontend\/src\/app\/.*$/gim, "").replace(/Profesional - \w+/gi, "").replace(/Plan de Estudio[:\s]*/gi, "").replace(/Plan de Estudio Personalizado[:\s]*/gi, "").replace(/^<h1[^>]*>.*?<\/h1>/gim, "").replace(/<h1[^>]*>Plan de Estudio[:\s]*[^<]*<\/h1>/gi, "").replace(/<h2[^>]*>Plan de Estudio[:\s]*[^<]*<\/h2>/gi, "").replace(/<h3[^>]*>Plan de Estudio[:\s]*[^<]*<\/h3>/gi, "").replace(/^\s{0,3}#{1,6}\s*\d+[\.\)\:\-]*\s*$/gm, "").replace(/^\s*\d+[\.\)]\s*$/gm, "").replace(/^\s*###\s*$/gm, "").replace(/^####\s+/gm, "").replace(/^###\s+/gm, "").replace(/^##\s+/gm, "").replace(/^#\s+/gm, "").replace(/^VIDEOS[:\s]*/gim, "").replace(/^ACTIVIDADES[:\s]*/gim, "").replace(/^RECURSOS[:\s]*/gim, "").replace(/^(?:Fecha de inicio|Fecha inicio|Inicio|Comienzo|Start)[:\s\-]*.*$/gim, "").replace(/<p>\s*(?:Fecha de inicio|Fecha inicio|Inicio|Comienzo|Start)[:\s\-]*.*?<\/p>/gi, "").replace(/\n{3,}/g, "\n\n");
    result = result.replace(/<environment_details[^>]*>/gi, "");
    result = result.replace(/(?<!\\)\bfrac\{([^{}]+)\}\{([^{}]+)\}/g, "\\frac{$1}{$2}");
    result = result.replace(/(?<!\\)\bsqrt\{([^{}]+)\}/g, "\\sqrt{$1}");
    result = result.replace(/(?<!\\)\bsum\b/g, "\\sum");
    result = result.replace(/(?<!\\)\bint\b/g, "\\int");
    result = result.replace(/(?<!\\)\blim\b/g, "\\lim");
    result = result.replace(/(?<!\\)\bprod\b/g, "\\prod");
    result = result.replace(/(?<!\\)\balpha\b/g, "\\alpha");
    result = result.replace(/(?<!\\)\bbeta\b/g, "\\beta");
    result = result.replace(/(?<!\\)\bgamma\b/g, "\\gamma");
    result = result.replace(/(?<!\\)\bdelta\b/g, "\\delta");
    result = result.replace(/(?<!\\)\brho\b/g, "\\rho");
    result = result.replace(/(?<!\\)\btheta\b/g, "\\theta");
    result = result.replace(/(?<!\\)\bpi\b/g, "\\pi");
    result = result.replace(/(?<!\\)\bneq\b/g, "\\neq");
    result = result.replace(/(?<!\\)\bleq\b/g, "\\leq");
    result = result.replace(/(?<!\\)\bgeq\b/g, "\\geq");
    result = result.replace(/(?<!\\)\bapprox\b/g, "\\approx");
    result = result.replace(/(?<!\\)\bequiv\b/g, "\\equiv");
    result = result.replace(/(?<!\\)\btimes\b/g, "\\times");
    result = result.replace(/(?<!\\)\bcdot\b/g, "\\cdot");
    result = this.stripMathLineBreaks(result);
    result = result.replace(/<details/gi, "<details open");
    return result.trim();
  }
  /** Quita los saltos de línea LaTeX (\\ y saltos de carro) que estén DENTRO
   *  de las expresiones matemáticas $...$ / $$...$$, para que varias
   *  fracciones en la misma fórmula queden en una sola línea y se rendericen
   *  en línea en lugar de una debajo de la otra. */
  stripMathLineBreaks(text) {
    return text.replace(/\$(\$)?([\s\S]*?)\1\$/g, (m, dq, inner) => {
      const cleaned = inner.replace(/\\\\/g, " ").replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ").trim();
      return (dq ? "$$" : "$") + cleaned + (dq ? "$$" : "$");
    });
  }
  combineMathLines(md) {
    const operators = ["\xD7", "\\times", "\\cdot", "\\div", "\\pm", "\\mp", "=", "+", "-", "\u22C5", "/", "\xB7", "*"];
    const operatorPattern = operators.map((op) => op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    let prev;
    let current = md;
    do {
      prev = current;
      current = current.replace(
        new RegExp(`(\\$[^\\$]+\\$[^\\n]*)\\s*\\n+\\s*(${operatorPattern}|[+\\-\xD7\xF7=*\xB7])\\s*\\n+\\s*(\\$[^\\$]+\\$[^\\n]*)`, "g"),
        (match, f1, op, f2) => `${f1} ${op} ${f2}`
      );
    } while (current !== prev);
    current = current.replace(
      new RegExp(`(\\$[^\\$]+\\$)\\s*<br\\s*/?>\\s*(${operatorPattern}|[+\\-\xD7\xF7=*\xB7])\\s*<br\\s*/?>\\s*(\\$[^\\$]+\\$)`, "gi"),
      (match, f1, op, f2) => `${f1} ${op} ${f2}`
    );
    do {
      prev = current;
      current = current.replace(
        /(\$[^\$]+\$)\s*\n\s*(\$(?![=×⋅·*\/\+\-]).*?\$)/g,
        (match, f1, f2) => `${f1} \\cdot ${f2}`
      );
    } while (current !== prev);
    do {
      prev = current;
      current = current.replace(/(\$[^\$]+\$)\s*\n\s*(\$[^\$]+\$)/g, "$1 $2");
    } while (current !== prev);
    const mathLineRegex = /^[\s\p{L}\p{N}=×÷⋅*\/\+\-≥≤<>^_(){}\[\]\\|·]+$/u;
    do {
      prev = current;
      current = current.replace(/(^|\n)([^\n]+)\n([^\n]+)(?=\n|$)/g, (match, prefix, line1, line2) => {
        const trimmed1 = line1.trim();
        const trimmed2 = line2.trim();
        if (trimmed1 && trimmed2 && mathLineRegex.test(trimmed1) && mathLineRegex.test(trimmed2)) {
          return `${prefix}${trimmed1} ${trimmed2}`;
        }
        return match;
      });
    } while (current !== prev);
    current = current.replace(/\s*\n\s*(?:=|×|⋅|\*|\bx\b|\bX\b)\s*/g, " $& ");
    current = current.replace(/\s*(?:=|×|⋅|\*|\bx\b|\bX\b)\s*\n\s*/g, " $& ");
    return current;
  }
  // Convert markdown to HTML for proper rendering
  convertMarkdownToHtml(text) {
    text = this.combineMathLines(text);
    let html = text.replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, "").replace(/<environment_details>[\s\S]*$/gi, "");
    html = this.sanitizeAiText(html);
    html = html.replace(/&/g, "&amp;");
    html = html.replace(/\\/g, "##LATEX_BACKSLASH##");
    html = html.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/##LATEX_BACKSLASH##/g, "\\\\");
    html = html.replace(/\*/g, "");
    html = html.replace(/^-\s+/gm, "");
    html = html.replace(/^•\s+/gm, "");
    html = html.replace(/^---+$/gm, "");
    html = html.replace(/^\*\*\*+$/gm, "");
    html = html.replace(/^___+$/gm, "");
    html = html.replace(/pregunta/gi, "<strong>pregunta</strong>");
    html = html.replace(/respuesta/gi, "<strong>respuesta</strong>");
    html = html.replace(/(RECURSOS[:\s]*)([\s\S]*?)(?=EJERCICIOS|CONSEJOS|EVALUACIÓN|OBJETIVO|$)/gi, (match, prefix, content) => {
      let videos = [];
      let activities = [];
      const lines = content.split("\n");
      lines.forEach((line) => {
        const trimmedLine = line.trim();
        const pipeMatch = trimmedLine.match(/^(.+?)\s*\|\s*(https?:\/\/[^\s]+)/);
        if (pipeMatch) {
          const title = pipeMatch[1].trim();
          const url = pipeMatch[2].trim();
          if (url.includes("youtube") || url.includes("khanacademy") || url.includes("youtu.be")) {
            videos.push({ title, url });
          }
        } else if (trimmedLine.includes("youtube") || trimmedLine.includes("khanacademy") || trimmedLine.includes("youtu.be")) {
          const urlMatch = trimmedLine.match(/(https?:\/\/[^\s]+)/);
          if (urlMatch) {
            let title = urlMatch[1];
            title = title.replace("https://", "").replace("http://", "");
            title = title.replace("www.youtube.com/watch?v=", "YouTube: ");
            title = title.replace("youtu.be/", "YouTube: ");
            title = title.replace("www.khanacademy.org/", "Khan Academy: ");
            if (title.length > 50) {
              title = title.substring(0, 47) + "...";
            }
            videos.push({ title, url: urlMatch[1] });
          }
        } else if (trimmedLine && !trimmedLine.toLowerCase().startsWith("videos") && !trimmedLine.toLowerCase().startsWith("actividades")) {
          activities.push(trimmedLine);
        }
      });
      const limitedVideos = videos.slice(0, 3);
      let result = '<div class="resources-section"><div class="video-section">';
      if (limitedVideos.length > 0) {
        limitedVideos.forEach((v) => {
          let displayTitle = v.title;
          displayTitle = displayTitle.replace(/^\d+[\.\)]\s*/, "");
          displayTitle = displayTitle.trim();
          result += `<div class="video-card">
            <div class="video-icon">\u25B6</div>
            <div class="video-content">
              <a href="${v.url}" class="video-link" onclick="window.open(this.href, '_blank', 'resizable=yes,scrollbars=yes'); return false;">${displayTitle}</a>
              <span class="video-source">${v.url.includes("youtube") ? "YouTube" : "Khan Academy"}</span>
            </div>
          </div>`;
        });
      }
      result += "</div>";
      result += '<div class="activities-section">';
      if (activities.length > 0) {
        activities.forEach((a) => result += `${a}<br>`);
      }
      result += "</div></div>";
      return result;
    });
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="video-link" onclick="window.open(this.href, "_blank", "resizable=yes,scrollbars=yes"); return false;" rel="noopener noreferrer">$1</a>');
    html = html.replace(/<a([^>]*?)>/gi, (match, attrs) => {
      if (/target=/i.test(attrs)) {
        return match.replace(/<a([^>]*?)>/i, (m, innerAttrs) => {
          if (/rel=/i.test(innerAttrs)) return m;
          return `<a${innerAttrs} rel="noopener noreferrer">`;
        });
      }
      const relAttr = /rel=/i.test(attrs) ? "" : ' rel="noopener noreferrer"';
      return `<a${attrs}${relAttr} target="_blank">`;
    });
    html = html.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
    html = html.replace(/^### (.*$)/gm, '<div class="ai-section-header ai-h4">$1</div>');
    html = html.replace(/^## (.*$)/gm, '<div class="ai-section-header ai-h3">$1</div>');
    html = html.replace(/^# (.*$)/gm, '<div class="ai-section-header ai-h2">$1</div>');
    html = html.replace(/^(\d+)\.\s+(.*)$/gm, "<li>$2</li>");
    html = html.replace(/^[•\-]\s+(.*)$/gm, "<li>$1</li>");
    html = html.replace(/^[✓✅]\s+/gm, '<li><span class="check">\u2713</span> ');
    html = html.replace(/(<li>.*?<\/li>)\n?/g, "$1");
    const tableRegex = /(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)+)/g;
    html = html.replace(tableRegex, (match, headerRow, separatorRow, bodyRows) => {
      const headers = headerRow.split("|").filter((c) => c.trim()).map((h) => `<th>${h.trim()}</th>`).join("");
      const rows = bodyRows.split("\n").filter((r) => r.trim()).map((row) => {
        const cells = row.split("|").filter((c) => c.trim()).map((c) => `<td>${c.trim()}</td>`).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      return `<div class="table-wrapper"><table class="ai-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
    });
    const mathPlaceholders = [];
    let protectedHtml = html.replace(/\$[^\$]+\$/g, (match) => {
      mathPlaceholders.push(match);
      return `__MATH_PLACEHOLDER_${mathPlaceholders.length - 1}__`;
    });
    protectedHtml = protectedHtml.replace(/\n\n+/g, '</p></div><div class="paragraph-block"><p>');
    protectedHtml = '<div class="paragraph-block"><p>' + protectedHtml + "</p></div>";
    protectedHtml = protectedHtml.replace(/__MATH_PLACEHOLDER_(\d+)__/g, (match, index) => {
      return mathPlaceholders[parseInt(index)];
    });
    html = html.replace(/(<li>.*?<\/li>)+/g, '<ul class="ai-list">$1</ul>');
    html = html.replace(/<details/gi, "<details open");
    return html;
  }
  async generateStudyPlan() {
    if (!this.selectedStudentForPlan) return;
    if (!this.studyPlanTopics?.trim()) return;
    if (!this.selectedGrade) return;
    if (!this.selectedPeriod) return;
    this.isGeneratingPlan = true;
    this.planGenerated = false;
    this.planSaved = false;
    this.progressPercent = 0;
    this.showProgressBar = true;
    this.animateProgress();
    this.studyPlanContent = "";
    let fullText = "";
    this.initNotificationSound();
    const student = this.selectedStudentForPlan;
    const studentName = student.name;
    const imageContext = this.uploadedImages.length > 0 ? `
IM\xC1GENES ADJUNTAS: Se han proporcionado ${this.uploadedImages.length} imagen(es) que contienen informaci\xF3n relevante (ejercicios, ex\xE1menes, tareas del estudiante). Analiza estas im\xE1genes para entender las dificultades del estudiante y generar un plan personalizado.
` : "";
    const subjectName = (this.selectedSubject || this.teacherSubjectName || "").toLowerCase();
    const subjectArea = /(matem|algebra|geometr|calculo|aritmet|estadistic|trigonometr)/.test(subjectName) ? "Matem\xE1ticas" : /(fisica|quimica|biolog)/.test(subjectName) ? "Ciencias Naturales" : /(ingles|english|language)/.test(subjectName) ? "Ingl\xE9s" : /(lengua|literat|español|comprensi[oó]n\s*lectora|lectura)/.test(subjectName) ? "Lengua y Literatura" : /(social|historia|geograf|civica|filosof)/.test(subjectName) ? "Ciencias Sociales" : /(informat|tecnolog|programac|tic)/.test(subjectName) ? "Tecnolog\xEDa e Inform\xE1tica" : /(artistica|m[uú]sica|pintura|dibujo)/.test(subjectName) ? "Educaci\xF3n Art\xEDstica" : /(educacion\s*fisica|deporte)/.test(subjectName) ? "Educaci\xF3n F\xEDsica" : /(religion|etica)/.test(subjectName) ? "Formaci\xF3n Integral" : "\xC1rea acad\xE9mica general";
    const gradeNumber = parseInt((this.selectedGrade || "").toString().match(/\d+/)?.[0] || "0", 10);
    const scaffoldingLevel = gradeNumber <= 3 ? "alto (instrucci\xF3n muy atomizada, ejemplos visuales, sesiones cortas)" : gradeNumber <= 7 ? "medio (andamiaje expl\xEDcito + pr\xE1ctica guiada + independiente)" : "bajo (retos complejos, metacognici\xF3n, transferencia y conexi\xF3n interdisciplinar)";
    const ejercNivel1 = gradeNumber <= 3 ? 5 : gradeNumber <= 7 ? 5 : 4;
    const ejercNivel2 = gradeNumber <= 3 ? 4 : gradeNumber <= 7 ? 4 : 4;
    const ejercNivel3 = gradeNumber <= 3 ? 2 : gradeNumber <= 7 ? 3 : 3;
    const numPreguntasEval = gradeNumber <= 3 ? 8 : 10;
    const prompt = `ROL Y PERSONALIDAD:
Eres un pedagogo senior con m\xE1s de 20 a\xF1os de experiencia dise\xF1ando planes de estudio personalizados. Combinas instrucci\xF3n explic\xEDcita, andamiajecognitivo, pr\xE1ctica deliberada y ciencia del aprendizaje (pr\xE1ctica espaciada, retrieval practice, interleaving, dual coding, elaboraci\xF3n, metacognici\xF3n). Tu tono es c\xE1lido, directo y respetuoso con el estudiante. Nunca condescendiente.

PERFIL DEL PLAN:
- \xC1rea/materia detectada: ${subjectArea}
- Nombre del estudiante (solo para personalizar, NO usar en datos sensibles): ${studentName}
- Grado: ${this.selectedGrade} (nivel ${gradeNumber || "?"}\xBA)
- Per\xEDodo acad\xE9mico: ${this.selectedPeriod}
- Temas a reforzar: ${this.studyPlanTopics}
- Andamiaje pedag\xF3gico recomendado: ${scaffoldingLevel}
${imageContext}

ESTILO Y FORMA DEL PLAN (MUY IMPORTANTE):
Este plan debe leerse como un TEXTO CORRIDO de lectura agradable, NO como un manual t\xE9cnico. Piensa en un cap\xEDtulo corto de un libro de apoyo escolar bien escrito, no en una ficha de actividades.

REGLAS INQUEBRANTABLES DE FORMATO (incumplir cualquiera = respuesta inv\xE1lida):
1. SALIDA = SOLO HTML v\xE1lido y bien formado. PROHIBIDO: bloques de c\xF3digo (\`\`\`html, \`\`\`), comillas invertidas, markdown, fences, texto fuera de etiquetas HTML.
2. PROHIBIDO todo contenido audiovisual externo: nada de videos, YouTube, "ver video", "no disponible", "enlace roto", links a plataformas de video. Solo recursos TEXTUALES (libros, gu\xEDas, apuntes, fichas).
3. PROHIBIDO fechas concretas o a\xF1os. NO incluir cronogramas por d\xEDas, semanas ni horarios. NO usar bloques tipo "D\xEDa 1", "Bloque 1", "Sesi\xF3n 1", "Semana X", "Minuto X", ni divisiones temporales de ning\xFAn tipo. El plan es continuo, no calendarizado.
4. F\xF3rmulas matem\xE1ticas SOLO en l\xEDnea con $...$ (ej: $\\frac{a}{b} \\times \\frac{c}{d}$). NUNCA rompas una operaci\xF3n en varias l\xEDneas. NUNCA uses [...] ni $$...$$.
5. SI el \xE1rea es matem\xE1ticas o ciencias: TODA f\xF3rmula debe ir en $...$, inline. SI el \xE1rea es lengua/ingl\xE9s/sociales: NO uses notaci\xF3n matem\xE1tica; usa texto natural entrecomillado si necesitas ejemplos.
6. El documento DEBE terminar EXACTAMENTE con la l\xEDnea: PLAN DE ESTUDIO COMPLETO.
7. NO incluyas saludos, introducciones tipo "Aqu\xED tienes tu plan\u2026", ni cierres tipo "Espero que te sirva\u2026". Empieza directamente por la primera etiqueta <h2>.
8. NO uses <br> para separar p\xE1rrafos; usa SIEMPRE <p>\u2026</p> con cierre correcto. NO uses <h1>; usa <h2> para secciones principales y <h3> solo dentro del TALLER FINAL si necesitas agrupar ejercicios.
9. SEPARACI\xD3N ORTOGR\xC1FICA: cada p\xE1rrafo debe ir en su propio <p> con margen visible (el CSS ya a\xF1ade separaci\xF3n, pero t\xFA DEBES entregar p\xE1rrafos cortos, de 2-4 frases m\xE1ximo, NO bloques compactos). Tras cada <p> a\xF1ade UN p\xE1rrafo en blanco (un <p></p> vac\xEDo) SOLO si quieres forzar un salto mayor; en general basta con p\xE1rrafos cortos.

ESTRUCTURA OBLIGATORIA (encabezados <h2> en este orden EXACTO, sin saltarse ninguno, sin agregar secciones extra):

1. <h2>OBJETIVO</h2>
   Una meta SMART contada en 2-3 p\xE1rrafos cortos (no una sola frase larga). Vincula expl\xEDcitamente los temas del estudiante con 2-3 competencias curriculares propias de ${this.selectedGrade} en ${subjectArea}. Tono cercano, dirigido al estudiante en segunda persona ("vas a\u2026", "podr\xE1s\u2026").

2. <h2>INTRODUCCI\xD3N</h2>
   2-4 p\xE1rrafos cortos que ContextUALIZAN los temas: por qu\xE9 son importantes, d\xF3nde se usan en la vida real, qu\xE9 van a aprender en concreto. Es la "puerta de entrada" al texto. Lenguaje claro, sin tecnicismos innecesarios.

3. <h2>DESARROLLO DEL TEMA</h2>
   Esta es la secci\xF3n M\xC1S EXTENSA. Es el cuerpo del texto explicativo. Estructura el contenido en 4-6 subtemas (<h3>Auto-descubiertos seg\xFAn los temas dados, NO usar "Subtema 1", "Subtema 2" \u2014 usar nombres reales como <h3>Multiplicaci\xF3n de fracciones</h3>, <h3>Regla de tres simple</h3>, etc.). Cada subtema debe tener 2-4 p\xE1rrafos cortos explicativos. Puedes usar <strong> para resaltar ideas clave y <em> para matices. NO insertes listas largas aqu\xED; el desarrollo es prosa.

4. <h2>ERRORES COMUNES A EVITAR</h2>
   Lista <ul> con 4-6 errores t\xEDpicos ESPEC\xCDFICOS de los temas dados. Para cada error: <strong>nombre del error</strong> + 1 frase de por qu\xE9 ocurre + 1 frase de c\xF3mo evitarlo. Tono constructivo, no sancionador.

5. <h2>CONSEJOS DE ESTUDIO</h2>
   4-5 p\xE1rrafos cortos (uno por consejo), cada uno con un <strong>t\xEDtulo</strong> al inicio. Basados en ciencia del aprendizaje aplicados ESPEC\xCDFICAMENTE a estos temas (NO consejos gen\xE9ricos como "estudia m\xE1s"). Pueden mencionar t\xE9cnicas como pr\xE1ctica espaciada, retrieval, elaboraci\xF3n, pero SIEMPRE conectadas al contenido concreto.

6. <h2>TALLER DE PR\xC1CTICA</h2>
   Esta es la \xDANICA secci\xF3n con ejercicios / actividades pr\xE1cticas. Estructura:
   - <p>Un p\xE1rrafo corto de introducci\xF3n al taller (2-3 frases) que explique qu\xE9 va a practicar el estudiante y por qu\xE9.</p>
   - <h3>Ejercicios b\xE1sicos (${ejercNivel1})</h3> seguidos de una lista <ol> con los ${ejercNivel1} ejercicios. Formato: "<strong>Ejercicio N.</strong> [enunciado completo]. Respuesta: [clave o procedimiento]."
   - <h3>Ejercicios de aplicaci\xF3n (${ejercNivel2})</h3> seguidos de <ol> con los ${ejercNivel2} ejercicios en el mismo formato.
   - <h3>Ejercicio de desaf\xEDo (${ejercNivel3})</h3> seguidos de <ol> con los ${ejercNivel3} ejercicios. Estos pueden incluir "Pista:" breve al final.

7. <h2>PARA PROFUNDIZAR</h2>
   3-5 p\xE1rrafos cortos sugiriendo lecturas, ejercicios opcionales o ideas para que el estudiante siga avanzando por su cuenta. NO enlaces web ni videos; solo referencias TEXTUALES (cap\xEDtulos de libros, tipos de problemas para buscar, etc.).

8. <h2>CIERRE MOTIVADOR</h2>
   2-3 p\xE1rrafos cortos, personalizados (usa ${studentName} una vez), con mentalidad de crecimiento. Tono c\xE1lido y realista, nada de frases vac\xEDas.

ESTILO VISUAL OBLIGATORIO:
- <h2> secciones principales, <h3> solo dentro del TALLER y para subtemas del DESARROLLO.
- <p> con p\xE1rrafos CORTOS (2-4 frases). NUNCA p\xE1rrafos de 8+ l\xEDneas.
- <strong> para \xE9nfasis puntual, <em> para tono reflexivo.
- <ul>/<ol> SOLO en "Errores comunes" y "Taller de pr\xE1ctica".
- Sin tablas (no se necesitan en este formato).
- Sin recuadros, sin divs de colores, sin bloques estructurados.
- El documento debe leerse como un art\xEDculo de blog educativo bien editado.

EJEMPLO DE ANCLAJE DE ESTILO (solo referencia, NO copies literal):
<h2>OBJETIVO</h2>
<p>Vas a aprender a multiplicar fracciones de forma segura, explicando cada paso con tus propias palabras. Al terminar, podr\xE1s resolver ejercicios de ${subjectArea} t\xEDpicos de ${this.selectedGrade} sin necesidad de ayuda externa.</p>
<p>Esta habilidad es la base para temas posteriores como la divisi\xF3n de fracciones y los problemas de proporcionalidad, as\xED que vale la pena que la domines con calma.</p>

CADENA DE GENERACI\xD3N (obligatoria, en este orden):
A) Planifica internamente el contenido de cada secci\xF3n.
B) Escribe la salida EN ORDEN: OBJETIVO \u2192 INTRODUCCI\xD3N \u2192 DESARROLLO \u2192 ERRORES COMUNES \u2192 CONSEJOS \u2192 TALLER \u2192 PROFUNDIZAR \u2192 CIERRE.
C) Cierra con la l\xEDnea exacta "PLAN DE ESTUDIO COMPLETO".
D) NO repitas secciones. NO dejes secciones a medias. NO cortes a mitad de un p\xE1rrafo o una lista.
E) Si el texto es largo, sigue hasta terminar; bajo NING\xDAN concepto te detengas antes de "PLAN DE ESTUDIO COMPLETO".

AHORA genera el plan completo de una sola vez.`;
    const AI_IDLE_TIMEOUT_MS = 3e5;
    let idleTimer = null;
    const abortController = new AbortController();
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => abortController.abort(), AI_IDLE_TIMEOUT_MS);
    };
    try {
      const url = `${this.AI_PROXY_BASE}/study-plan-stream`;
      resetIdleTimer();
      const response = await this.authFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          temperature: 0.25,
          max_tokens: 12e3
        }),
        signal: abortController.signal
      });
      if (!response.ok) {
        this.stopProgressAnimation();
        let errorMsg = "";
        if (response.status === 503) {
          errorMsg = "El servicio de IA no est\xE1 disponible temporalmente. Por favor intenta m\xE1s tarde o contacta al administrador.";
        } else if (response.status === 429) {
          errorMsg = "Has excedido el l\xEDmite de solicitudes. Por favor espera un momento e intenta de nuevo.";
        } else if (response.status === 401 || response.status === 403) {
          errorMsg = "Tu sesi\xF3n expir\xF3 o no tienes permiso para usar la IA. Cierra sesi\xF3n, vuelve a entrar e intenta de nuevo.";
        } else {
          errorMsg = `Error del servidor (${response.status}). Por favor intenta de nuevo.`;
        }
        this.studyPlanContent = errorMsg;
        this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(errorMsg);
        this.showProgressBar = false;
        this.isGeneratingPlan = false;
        this.planGenerated = true;
        return;
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      if (!reader) {
        throw new Error("No response body");
      }
      while (true) {
        const { done, value } = await reader.read();
        resetIdleTimer();
        if (done) {
          if (buffer.trim()) {
            const line = buffer.trim();
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr && jsonStr !== "[DONE]") {
                try {
                  const data = JSON.parse(jsonStr);
                  if (data.error) {
                    const err = new Error(typeof data.error === "string" ? data.error : "Error de la IA");
                    err.streamError = true;
                    throw err;
                  }
                  if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                    const newText = data.choices[0].delta.content;
                    if (newText) {
                      fullText += newText;
                      this.updateStreamingPreviewAndProgress(fullText);
                    }
                  }
                } catch (e) {
                  if (e && e.streamError) throw e;
                  console.warn("Error parsing final stream chunk", e);
                }
              }
            }
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              const data = JSON.parse(jsonStr);
              if (data.error) {
                const err = new Error(typeof data.error === "string" ? data.error : "Error de la IA");
                err.streamError = true;
                throw err;
              }
              if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                const newText = data.choices[0].delta.content;
                if (newText) {
                  fullText += newText;
                  this.updateStreamingPreviewAndProgress(fullText);
                }
              }
            } catch (e) {
              if (e && e.streamError) throw e;
              console.warn("Error parsing stream chunk", e);
            }
          }
        }
      }
      if (idleTimer) clearTimeout(idleTimer);
      this.stopProgressAnimation();
      this.progressPercent = Math.max(this.progressPercent, 98);
      if (!fullText || !fullText.trim()) {
        const errorMsg = "La IA no devolvi\xF3 contenido. Por favor intenta generar el plan de nuevo.";
        this.studyPlanContent = errorMsg;
        this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(errorMsg);
        this.showProgressBar = false;
        this.progressPercent = 0;
        this.planGenerated = true;
        return;
      }
      let sanitizedText = this.sanitizeAiText(fullText);
      const urlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|webp\?[^\s]*))/gi;
      const imageUrls = sanitizedText.match(urlRegex) || [];
      this.extractedImages = imageUrls;
      sanitizedText = sanitizedText.replace(urlRegex, "").replace(/\n\n\n+/g, "\n\n");
      const hasHtmlTags = /<[a-z][\s\S]*>/i.test(sanitizedText);
      if (hasHtmlTags) {
        let cleanHtml = sanitizedText.replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, "").replace(/<environment_details>[\s\S]*$/gi, "").replace(/<[\w-]+_details>[\s\S]*?<\/[\w-]+_details>/gi, "").replace(/Profesional - \w+/gi, "").replace(/<h1[^>]*>Plan de Estudio[:\s]*[^<]*<\/h1>/gi, "").replace(/<h2[^>]*>Plan de Estudio[:\s]*[^<]*<\/h2>/gi, "").replace(/<h3[^>]*>Plan de Estudio[:\s]*[^<]*<\/h3>/gi, "").replace(/\n{3,}/g, "\n\n");
        if (cleanHtml.startsWith("```html") && cleanHtml.endsWith("```")) {
          cleanHtml = cleanHtml.substring(7, cleanHtml.length - 3).trim();
        } else if (cleanHtml.startsWith("```") && cleanHtml.endsWith("```")) {
          cleanHtml = cleanHtml.substring(3, cleanHtml.length - 3).trim();
        }
        cleanHtml = cleanHtml.replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, "");
        cleanHtml = cleanHtml.replace(/<environment_details>/gi, "");
        cleanHtml = cleanHtml.replace(/Visible files:[\s\S]*?(?=<|$)/gi, "");
        cleanHtml = cleanHtml.replace(/Open tabs:[\s\S]*$/gi, "");
        cleanHtml = cleanHtml.replace(/<details/gi, "<details open");
        this.studyPlanContent = this.keepOnlyDayOne(this.combineMathParagraphs(cleanHtml.trim()));
        this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(this.studyPlanContent);
        setTimeout(async () => {
          const filteredContent = await this.filterUnavailableVideos(this.studyPlanContent);
          this.studyPlanContent = filteredContent;
          this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(filteredContent);
          this.renderMathExpressions();
        }, 100);
      } else {
        let markdown = sanitizedText;
        if (markdown.startsWith("```html") && markdown.endsWith("```")) {
          markdown = markdown.substring(7, markdown.length - 3).trim();
        } else if (markdown.startsWith("```") && markdown.endsWith("```")) {
          markdown = markdown.substring(3, markdown.length - 3).trim();
        }
        markdown = markdown.replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, "");
        markdown = markdown.replace(/<environment_details>/gi, "");
        markdown = markdown.replace(/Visible files:[\s\S]*?(?=<|$)/gi, "");
        markdown = markdown.replace(/Open tabs:[\s\S]*$/gi, "");
        this.studyPlanContent = this.keepOnlyDayOne(this.combineMathParagraphs(this.convertMarkdownToHtml(markdown)));
        this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(this.studyPlanContent);
        setTimeout(async () => {
          const filteredContent = await this.filterUnavailableVideos(this.studyPlanContent);
          this.studyPlanContent = filteredContent;
          this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(filteredContent);
          this.renderMathExpressions();
        }, 100);
      }
      if (!this.isStudyPlanComplete(this.studyPlanContent || "")) {
        const continuation = await this.requestStudyPlanContinuation(fullText);
        if (continuation) {
          const continuedText = this.sanitizeAiText(continuation);
          let mergedHtml = this.studyPlanContent || "";
          if (/<[a-z][\s\S]*>/i.test(continuedText)) {
            mergedHtml += "\n" + continuedText.trim();
          } else {
            mergedHtml += "\n" + this.convertMarkdownToHtml(continuedText.trim());
          }
          this.studyPlanContent = this.keepOnlyDayOne(this.combineMathParagraphs(mergedHtml.trim()));
          this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(this.studyPlanContent);
          setTimeout(async () => {
            const filteredContent = await this.filterUnavailableVideos(this.studyPlanContent);
            this.studyPlanContent = filteredContent;
            this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(filteredContent);
            this.renderMathExpressions();
          }, 100);
        }
      }
      setTimeout(() => this.renderMathExpressions(), 500);
      this.saveStudyPlanToBackend();
      this.onPlanGenerated();
    } catch (error) {
      if (idleTimer) clearTimeout(idleTimer);
      const errorMsg = error?.name === "AbortError" ? "La IA est\xE1 tardando demasiado en responder. Por favor intenta de nuevo en unos minutos." : error?.streamError && error?.message ? error.message : "Error de conexi\xF3n. Por favor verifica tu conexi\xF3n a internet e intenta de nuevo.";
      this.studyPlanContent = errorMsg;
      this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(errorMsg);
      this.stopProgressAnimation();
      this.showProgressBar = false;
      this.progressPercent = 0;
      this.planGenerated = true;
    }
  }
  saveStudyPlanToBackend() {
    if (!this.selectedStudentForPlan || !this.studyPlanContent) {
      console.error("No student selected or no plan content");
      return;
    }
    let day1Content = "";
    const day1Match = this.studyPlanContent.match(/<h2[^>]*>DÍA 1[^<]*<\/h2>([\s\S]*?)(?=<h2|RECURSOS|$)/i);
    if (day1Match) day1Content = day1Match[1].trim();
    if (!day1Content) {
      const plainDay1Match = this.studyPlanContent.match(/DÍA 1:[\s\S]*?(?=RECURSOS|$)/i);
      if (plainDay1Match) day1Content = "<p>" + plainDay1Match[0].replace(/DÍA 1:/i, "").trim() + "</p>";
    }
    const payload = {
      studentId: this.selectedStudentForPlan.id,
      studentName: `${this.selectedStudentForPlan.surname} ${this.selectedStudentForPlan.name}`,
      subjectName: "",
      period: this.selectedPeriod,
      topics: this.studyPlanTopics || "",
      planContent: this.studyPlanContent || "",
      durationDays: 1,
      day1Content: day1Content || "",
      teacherId: this.getCurrentTeacherId()
    };
    this.http.post(API_ORIGIN + "/api/grades/study-plan", payload).subscribe({
      next: () => {
        if (this.selectedStudentForPlan) {
          const studentId = this.selectedStudentForPlan.id;
          const period = this.selectedPeriod;
          if (!this.generatedPlans[studentId]) {
            this.generatedPlans[studentId] = {};
          }
          this.generatedPlans[studentId][period] = true;
        }
        this.planSaved = true;
      },
      error: (err) => {
        console.error("Error saving study plan:", err);
      }
    });
  }
  // Progress bar basada en lo ya generado por la IA
  planGenerationStartTime = 0;
  estimatedOutputLength = 6e3;
  progressInterval = null;
  animateProgress() {
    this.progressPercent = 1;
    this.planGenerationStartTime = Date.now();
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
  }
  isStudyPlanComplete(content) {
    const normalized = content.toUpperCase();
    const requiredSections = [
      "OBJETIVO",
      "CRONOGRAMA",
      "D\xCDA 1",
      "RECURSOS",
      "EJERCICIOS",
      "CONSEJOS",
      "EVALUACI\xD3N",
      "PLAN DE ESTUDIO COMPLETO",
      "CONCLUSI\xD3N"
    ];
    return requiredSections.every((section) => normalized.includes(section));
  }
  /**
   * fetch() con la sesión del usuario. Las llamadas con fetch NO pasan por el
   * interceptor HTTP del cliente, así que sin esto el backend las rechazaba con
   * 403 (todo /api/** exige JWT). Si el token venció, se renueva una vez y se
   * reintenta.
   */
  async authFetch(url, init = {}) {
    const send = (token) => fetch(url, {
      ...init,
      headers: {
        ...init.headers || {},
        ...token ? { Authorization: `Bearer ${token}` } : {}
      }
    });
    let res = await send(this.authService.getToken());
    if (res.status === 401 || res.status === 403) {
      try {
        const r = await firstValueFrom(this.authService.refreshToken());
        if (r?.token) {
          localStorage.setItem("token", r.token);
          if (r.refreshToken) localStorage.setItem("refreshToken", r.refreshToken);
          res = await send(r.token);
        }
      } catch {
      }
    }
    return res;
  }
  async requestStudyPlanContinuation(partialPlan) {
    try {
      const url = `${this.AI_PROXY_BASE}/study-plan-continuation`;
      const response = await this.authFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          partialPlan
        })
      });
      if (!response.ok) {
        return "";
      }
      const data = await response.json();
      return data?.content || "";
    } catch (e) {
      return "";
    }
  }
  updateStreamingPreviewAndProgress(fullText) {
    const sanitizedPreview = this.sanitizeAiText(fullText);
    if (sanitizedPreview.trim()) {
      this.studyPlanContent = this.convertMarkdownToHtml(sanitizedPreview);
      this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(this.studyPlanContent);
      setTimeout(async () => {
        const filteredContent = await this.filterUnavailableVideos(this.studyPlanContent);
        this.studyPlanContent = filteredContent;
        this.studyPlanContentSafe = this.sanitizer.bypassSecurityTrustHtml(filteredContent);
        this.renderMathExpressions();
      }, 100);
    }
    const currentLength = sanitizedPreview.length;
    const effectiveEstimatedLength = Math.max(this.estimatedOutputLength, 1500);
    const contentPercent = Math.round(currentLength / effectiveEstimatedLength * 100);
    this.progressPercent = Math.min(contentPercent, 100);
    this.progressPercent = Math.max(1, Math.floor(this.progressPercent));
    this.cdr.markForCheck();
  }
  // Mantener método por compatibilidad con llamadas existentes
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  stopProgressAnimation() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
  // Initialize notification sound
  initNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.playNotificationSound(audioContext);
    } catch (e) {
    }
  }
  // Play notification sound
  playNotificationSound(audioContext) {
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator1.connect(gainNode);
    oscillator2.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator1.type = "sine";
    oscillator1.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator1.frequency.setValueAtTime(880, audioContext.currentTime + 0.1);
    oscillator2.type = "sine";
    oscillator2.frequency.setValueAtTime(0, audioContext.currentTime);
    oscillator2.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
    oscillator1.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.15);
    oscillator2.start(audioContext.currentTime + 0.15);
    oscillator2.stop(audioContext.currentTime + 0.4);
  }
  // Mark plan as generated (called when plan is ready)
  onPlanGenerated() {
    this.stopProgressAnimation();
    this.isGeneratingPlan = false;
    const plainGeneratedLength = this.sanitizeAiText(this.studyPlanContent || "").replace(/<[^>]+>/g, "").trim().length;
    if (plainGeneratedLength > 0) {
      this.estimatedOutputLength = Math.round(
        this.estimatedOutputLength * 0.6 + plainGeneratedLength * 0.4
      );
    }
    this.progressPercent = 100;
    this.planGenerated = true;
    this.cdr.markForCheck();
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.playNotificationSound(audioContext);
    } catch (e) {
    }
  }
  // Save plan to database
  savePlan() {
    if (!this.selectedStudentForPlan || this.planSaved) return;
    this.saveStudyPlanToBackend();
    this.planSaved = true;
  }
  printStudyPlan() {
    const printContent = document.getElementById("study-plan-content");
    if (!printContent) {
      this.dialogService.alert("Primero debe generar un plan de estudio", "Nada que imprimir");
      return;
    }
    const printContentHTML = printContent.innerHTML || "";
    if (!printContentHTML.trim()) {
      this.dialogService.alert("El contenido del plan est\xE1 vac\xEDo", "Nada que imprimir");
      return;
    }
    const renderMathInElement = window.renderMathInElement;
    if (typeof renderMathInElement === "function") {
      try {
        renderMathInElement(printContent, {
          delimiters: [
            { left: "$$", right: "$$", display: false },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false,
          trust: true,
          strict: false
        });
      } catch (e) {
      }
    }
    const printNode = printContent.cloneNode(true);
    const printHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Plan de Estudio</title>
        <link href="${location.origin}${import.meta.env.BASE_URL}katex/katex.min.css" rel="stylesheet">
        <style>
          @page { size: A4; margin: 15mm; }
          html, body { height: 100%; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.45; color: #222; }
          .print-header { text-align: left; margin-bottom: 8px; }
          .print-header h1 { margin: 0; font-size: 20px; color: #4a1de9; }
          .print-body { width: 100%; }
          h2 { color: #332c50; border-bottom: 1px solid #ebe6fc; padding-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px; border: 1px solid #ddd; }
          .katex-display { display: inline-block !important; margin: 0 4px; }
          .katex { display: inline-block !important; vertical-align: middle; }
          img { max-width: 100%; height: auto; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>Plan de Estudio</h1>
        </div>
        <div class="print-body"></div>
        <script>
          (function(){
            var host = window.parent && window.parent.__printStudyPlanNode;
            var body = document.querySelector('.print-body');
            if (host && body) { body.appendChild(host); }
            setTimeout(function(){ window.print(); }, 1200);
          })();
        <\/script>
      </body>
      </html>
    `;
    window.__printStudyPlanNode = printNode;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.top = "-10000px";
    iframe.style.left = "-10000px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(printHTML);
          doc.close();
        } else {
          this.dialogService.alert("Error al crear el documento de impresi\xF3n", "Error de impresi\xF3n");
        }
      } catch (e) {
        this.dialogService.alert("Error al imprimir. Intente nuevamente.", "Error de impresi\xF3n");
      } finally {
        setTimeout(() => {
          window.__printStudyPlanNode = null;
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 2e3);
      }
    }, 100);
  }
  /**
   * Navegación tipo Excel dentro de la tabla de notas (funciona con cualquier
   * columna: ACT, columnas añadidas, Auto.Eval, recuperación, etc.):
   *   ↑ / ↓        celda de arriba / abajo (misma columna)
   *   Enter        baja una fila (Shift+Enter sube)
   *   → / ←        celda de la derecha / izquierda; al final de la fila pasa a
   *                la siguiente (y al inicio regresa a la anterior)
   * Al llegar a una celda se selecciona su contenido, así al escribir se
   * reemplaza el valor, como en Excel. En los campos de texto largo
   * (J.INTEG) ← → mueven el cursor y solo saltan de celda en los extremos.
   */
  handleKeydown(event) {
    if (!event || event.__navHandled) return;
    const target = event.target;
    if (!target || target.tagName !== "INPUT" || !target.closest(".grades-table")) return;
    const key = event.key;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(key)) return;
    event.__navHandled = true;
    const input = target;
    const row = input.closest("tr");
    const tbody = row?.parentElement;
    if (!row || !tbody) return;
    const rows = Array.from(tbody.children).filter((r) => r.tagName === "TR");
    const rowIdx = rows.indexOf(row);
    const cellsOf = (r) => r ? Array.from(r.querySelectorAll("input")) : [];
    const col = cellsOf(row).indexOf(input);
    if (rowIdx < 0 || col < 0) return;
    const isLongText = input.maxLength > 6;
    if (isLongText && (key === "ArrowLeft" || key === "ArrowRight")) {
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if (key === "ArrowLeft" && !atStart || key === "ArrowRight" && !atEnd) return;
    }
    let dest;
    switch (key) {
      case "ArrowUp":
        dest = cellsOf(rows[rowIdx - 1])[col];
        break;
      case "ArrowDown":
        dest = cellsOf(rows[rowIdx + 1])[col];
        break;
      case "Enter":
        dest = cellsOf(rows[rowIdx + (event.shiftKey ? -1 : 1)])[col];
        break;
      case "ArrowRight": {
        const here = cellsOf(row);
        dest = here[col + 1] ?? cellsOf(rows[rowIdx + 1])[0];
        break;
      }
      case "ArrowLeft": {
        const here = cellsOf(row);
        if (col > 0) dest = here[col - 1];
        else {
          const prev = cellsOf(rows[rowIdx - 1]);
          dest = prev[prev.length - 1];
        }
        break;
      }
    }
    event.preventDefault();
    if (!dest) return;
    dest.focus();
    dest.select();
    dest.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
