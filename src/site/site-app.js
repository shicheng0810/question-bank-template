import { decryptQuestionBankPayload } from '../lib/qbpack.js';
import {
  buildSearchBlob as buildQuestionSearchBlob,
  applyQuestionIdAliasToState,
  computeScopedReviewCounts,
  createSessionForMode,
  createSiteRuntime,
  evaluateFillAnswer,
  getModeBaseQuestions as getFilteredQuestionsForMode,
  getQuestionImages as getQuestionImageList,
  getQuestionType as detectQuestionType,
  isMultiQuestion as detectMultiQuestion,
  makeEmptySession as createEmptySession,
  normalizeQuestionBankForRuntime,
  questionMatchesFilters as matchesQuestionFilters,
  recordPracticeResult,
  recomputeSessionIds as recomputePlayerSessionIds,
  sanitizeAttemptMap,
  sanitizeIdList,
  sanitizePlayerPrefs,
  sanitizeSession as sanitizeStoredSession,
  shuffleWithRng,
  stripHtml as stripQuestionHtml,
} from './site-logic.js';

const MANIFEST_URL = 'banks/index.json';
const RECENT_BANKS_KEY = 'qb:recent-banks';
const LEGACY_STAR_KEY = 'amt_starred_questions';
const LEGACY_WRONG_KEY = 'amt_wrong_questions';
const LEGACY_ATTEMPT_KEY = 'amt_attempt_count_map_v1';
const LEGACY_AUTO_KEY = 'amt_auto_submit';
const SITE_LOCALE_KEY = 'qb:site:locale';
const SUPPORTED_LOCALES = ['en', 'zh', 'es'];

const I18N = {
  en: {
    'controls.language': 'Language',
    'controls.focus_on': 'Focus Mode',
    'controls.focus_off': 'Exit Focus',
    'hero.eyebrow': 'Question Bank Template',
    'hero.title': 'Open template with public and password-protected banks',
    'hero.subtitle': 'The template is public and forkable. Public banks open directly, while protected banks require a password from the owner.',
    'hero.stat_mode': 'Bank Modes',
    'hero.stat_mode_value': 'Public + Protected',
    'hero.stat_deploy': 'Deployment',
    'hero.stat_deploy_value': 'GitHub Pages',
    'hero.stat_author': 'Author Side',
    'hero.stat_author_value': 'Local Private Extractor',
    'common.all': 'All',
    'catalog.search_label': 'Search banks',
    'catalog.search_placeholder': 'Search by title, description, or tags',
    'catalog.mode_label': 'Bank type',
    'catalog.only_public': 'Public only',
    'catalog.only_protected': 'Protected only',
    'catalog.clear': 'Clear filters',
    'catalog.eyebrow': 'Catalog',
    'catalog.title': 'Question Banks',
    'catalog.empty': 'No banks match the current filters.',
    'catalog.no_description': 'No description provided.',
    'catalog.badge_public': 'Public bank',
    'catalog.badge_protected': '🔒 Password required',
    'catalog.open_public': 'Start practice',
    'catalog.open_protected': 'Unlock bank',
    'catalog.resume': 'Resume session',
    'catalog.bank_count': '{count} banks',
    'catalog.not_found': 'Bank not found: {bankId}',
    'recent.eyebrow': 'Recent',
    'recent.title': 'Continue where you left off',
    'recent.last_opened': 'Last opened: {time}',
    'recent.badge_public': 'Public bank',
    'recent.badge_protected': '🔒 Protected bank',
    'recent.continue': 'Continue',
    'player.back_to_catalog': 'Back to catalog',
    'player.mode_public': 'Public Bank',
    'player.mode_protected': 'Protected Bank',
    'player.default_description': 'This template supports mixed publishing for public and password-protected banks.',
    'player.open_nav': 'Question map',
    'player.reset_filters': 'Reset filters',
    'player.finish_exam': 'Submit exam',
    'player.empty': 'No questions match the current filters.',
    'stats.answered': 'Answered / Total',
    'stats.accuracy': 'Accuracy',
    'stats.review': 'Starred / Wrong',
    'mode.eyebrow': 'Mode',
    'mode.title': 'Study mode',
    'mode.all': 'Practice',
    'mode.wrong': 'Wrong only',
    'mode.starred': 'Starred only',
    'mode.random': 'Random',
    'mode.random150': 'Random 150',
    'mode.random150_current': 'Back to current 150',
    'mode.random150_reroll': 'Reroll 150',
    'mode.auto_on': 'Auto Submit: ON',
    'mode.auto_off': 'Auto Submit: OFF',
    'mode.exam': 'Mock exam',
    'mode.resume': 'Resume session',
    'mode.exam_count': 'Mock exam size',
    'filter.eyebrow': 'Filter',
    'filter.title': 'Question filters',
    'filter.search_label': 'Search prompt / choices / source',
    'filter.search_placeholder': 'e.g. hydraulics / draw / checklist',
    'filter.images_only': 'Images only',
    'filter.unanswered_only': 'Unanswered only',
    'filter.type': 'Type',
    'filter.tag': 'Tag',
    'filter.section': 'Section',
    'navigate.eyebrow': 'Navigate',
    'navigate.title': 'Question map',
    'navigate.count': '{count} questions',
    'current.eyebrow': 'Current',
    'question.star_aria': 'Star current question',
    'question.show_answer': 'Show answer',
    'question.redo': 'Redo question',
    'question.remove_wrong': 'Remove from wrong',
    'question.submit': 'Submit answer',
    'question.save': 'Save answer',
    'question.image_alt': 'Question image {index}',
    'question.no_source': 'No source',
    'keyboard.choice': '1-9 choose',
    'keyboard.submit': 'Enter submit',
    'keyboard.nav': 'J/K navigate',
    'keyboard.star': 'S star',
    'pager.prev': 'Previous',
    'pager.next': 'Next',
    'password.eyebrow': 'Protected Bank',
    'password.title': 'Enter bank password',
    'password.prompt': '{title} is protected. Enter the password provided by the owner to unlock the full bank.',
    'password.label': 'Password',
    'password.placeholder': 'Enter bank password',
    'password.remember': 'Remember password in this tab only',
    'password.cancel': 'Cancel',
    'password.submit': 'Enter bank',
    'password.hint': 'Hint: {hint}',
    'password.no_hint': 'No public password hint is available.',
    'password.required': 'Please enter the bank password.',
    'password.decrypt_fail': 'Unable to decrypt this bank.',
    'status.answer_required': 'Answer the question before submitting.',
    'status.correct': 'This answer is correct.',
    'status.wrong': 'This answer is incorrect.',
    'feedback.correct_title': 'Correct',
    'feedback.wrong_title': 'Incorrect',
    'feedback.reference_title': 'Reference answer',
    'feedback.fill_correct': 'All blanks are correct.',
    'feedback.correct_answers': 'Correct answer: {value}',
    'feedback.answer_matches': 'The answer matches.',
    'feedback.blank_label': 'Blank {index}',
    'feedback.empty': '(empty)',
    'explanation.label': 'Explanation',
    'summary.eyebrow': 'Exam Result',
    'summary.title': 'Mock exam summary',
    'summary.answered': 'Answered',
    'summary.correct': 'Correct',
    'summary.accuracy': 'Accuracy',
    'summary.wrong': 'Wrong',
    'summary.retry_wrong': 'Retry wrong questions',
    'summary.back_practice': 'Back to practice',
    'type.single': 'Single choice',
    'type.multi': 'Multiple choice',
    'type.fill': 'Fill in the blank',
    'misc.questions_unit': '{count} questions',
    'misc.has_images': 'Images',
    'misc.unknown': 'Unknown',
    'error.load_manifest': 'Failed to load bank catalog: {status}',
    'error.load_bank': 'Failed to load bank: {status}',
    'error.not_found': 'Bank not found: {bankId}',
    'error.generic_load': 'Failed to load the bank.',
    'lightbox.close': 'Close image preview',
  },
  zh: {
    'controls.language': '语言',
    'controls.focus_on': '专注模式',
    'controls.focus_off': '退出专注',
    'hero.eyebrow': 'Question Bank Template',
    'hero.title': '公开模板，支持公开题库与密码保护题库',
    'hero.subtitle': '模板公开可 fork。公开题库可直接练习，受保护题库需要持有者提供的密码后才能进入。',
    'hero.stat_mode': '题库模式',
    'hero.stat_mode_value': 'Public + Protected',
    'hero.stat_deploy': '部署形态',
    'hero.stat_deploy_value': 'GitHub Pages',
    'hero.stat_author': '作者端',
    'hero.stat_author_value': '本地私有提取器',
    'common.all': '全部',
    'catalog.search_label': '搜索题库',
    'catalog.search_placeholder': '按标题、描述、标签搜索',
    'catalog.mode_label': '题库类型',
    'catalog.only_public': '仅公开',
    'catalog.only_protected': '仅密码保护',
    'catalog.clear': '清除筛选',
    'catalog.eyebrow': 'Catalog',
    'catalog.title': '题库目录',
    'catalog.empty': '没有匹配的题库。',
    'catalog.no_description': '暂无描述。',
    'catalog.badge_public': '公开题库',
    'catalog.badge_protected': '🔒 需要密码',
    'catalog.open_public': '开始练习',
    'catalog.open_protected': '输入密码进入',
    'catalog.resume': '继续上次进度',
    'catalog.bank_count': '{count} 个题库',
    'catalog.not_found': '找不到题库：{bankId}',
    'recent.eyebrow': 'Recent',
    'recent.title': '继续上次进度',
    'recent.last_opened': '上次打开：{time}',
    'recent.badge_public': '公开题库',
    'recent.badge_protected': '🔒 保护题库',
    'recent.continue': '继续',
    'player.back_to_catalog': '返回目录',
    'player.mode_public': '公开题库',
    'player.mode_protected': '保护题库',
    'player.default_description': '这个模板支持公开题库与密码保护题库混合发布。',
    'player.open_nav': '题号导航',
    'player.reset_filters': '重置筛选',
    'player.finish_exam': '交卷',
    'player.empty': '当前筛选下没有可练习的题目。',
    'stats.answered': '已做 / 总题数',
    'stats.accuracy': '正确率',
    'stats.review': '收藏 / 错题',
    'mode.eyebrow': 'Mode',
    'mode.title': '学习模式',
    'mode.all': '普通刷题',
    'mode.wrong': '错题重练',
    'mode.starred': '收藏重练',
    'mode.random': '随机抽题',
    'mode.random150': '随机 150',
    'mode.random150_current': '回到当前 150',
    'mode.random150_reroll': '重抽 150',
    'mode.auto_on': 'Auto Submit: ON',
    'mode.auto_off': 'Auto Submit: OFF',
    'mode.exam': '模拟考试',
    'mode.resume': '继续会话',
    'mode.exam_count': '模拟考试题数',
    'filter.eyebrow': 'Filter',
    'filter.title': '题内检索',
    'filter.search_label': '搜索题干 / 选项 / 来源',
    'filter.search_placeholder': '例如 hydraulics / draw / checklist',
    'filter.images_only': '仅看带图题',
    'filter.unanswered_only': '仅看未做题',
    'filter.type': '题型',
    'filter.tag': '标签',
    'filter.section': '章节',
    'navigate.eyebrow': 'Navigate',
    'navigate.title': '题号导航',
    'navigate.count': '{count} 题',
    'current.eyebrow': 'Current',
    'question.star_aria': '收藏当前题',
    'question.show_answer': '显示答案',
    'question.redo': '重做本题',
    'question.remove_wrong': '从错题移除',
    'question.submit': '提交答案',
    'question.save': '保存答案',
    'question.image_alt': '题目图片 {index}',
    'question.no_source': '无来源',
    'keyboard.choice': '1-9 选项',
    'keyboard.submit': 'Enter 提交',
    'keyboard.nav': 'J/K 切题',
    'keyboard.star': 'S 收藏',
    'pager.prev': '上一题',
    'pager.next': '下一题',
    'password.eyebrow': 'Protected Bank',
    'password.title': '输入题库密码',
    'password.prompt': '{title} 需要密码才能进入。输入持有者提供的密码后即可完整做题。',
    'password.label': '密码',
    'password.placeholder': '输入题库密码',
    'password.remember': '本标签页临时记住密码',
    'password.cancel': '取消',
    'password.submit': '进入题库',
    'password.hint': '提示：{hint}',
    'password.no_hint': '没有公开密码提示。',
    'password.required': '请输入题库密码。',
    'password.decrypt_fail': '题库解密失败。',
    'status.answer_required': '请先作答后再提交。',
    'status.correct': '本题回答正确。',
    'status.wrong': '本题回答错误。',
    'feedback.correct_title': '回答正确',
    'feedback.wrong_title': '回答错误',
    'feedback.reference_title': '参考答案',
    'feedback.fill_correct': '所有填空都正确。',
    'feedback.correct_answers': '正确答案：{value}',
    'feedback.answer_matches': '答案匹配。',
    'feedback.blank_label': '第{index}空',
    'feedback.empty': '(空)',
    'explanation.label': '解析',
    'summary.eyebrow': 'Exam Result',
    'summary.title': '模拟考试结果',
    'summary.answered': '答题数',
    'summary.correct': '答对',
    'summary.accuracy': '正确率',
    'summary.wrong': '错题数',
    'summary.retry_wrong': '错题重练',
    'summary.back_practice': '回到普通刷题',
    'type.single': '单选',
    'type.multi': '多选',
    'type.fill': '填空',
    'misc.questions_unit': '{count} 题',
    'misc.has_images': '含图片',
    'misc.unknown': '未知',
    'error.load_manifest': '加载题库目录失败：{status}',
    'error.load_bank': '加载题库失败：{status}',
    'error.not_found': '找不到题库：{bankId}',
    'error.generic_load': '加载题库失败。',
    'lightbox.close': '关闭图片预览',
  },
  es: {
    'controls.language': 'Idioma',
    'controls.focus_on': 'Modo enfoque',
    'controls.focus_off': 'Salir del enfoque',
    'hero.eyebrow': 'Plantilla de banco de preguntas',
    'hero.title': 'Plantilla abierta con bancos públicos y protegidos por contraseña',
    'hero.subtitle': 'La plantilla es pública y se puede forkear. Los bancos públicos se abren directamente; los protegidos requieren una contraseña del autor.',
    'hero.stat_mode': 'Modos de banco',
    'hero.stat_mode_value': 'Público + Protegido',
    'hero.stat_deploy': 'Despliegue',
    'hero.stat_deploy_value': 'GitHub Pages',
    'hero.stat_author': 'Lado del autor',
    'hero.stat_author_value': 'Extractor privado local',
    'common.all': 'Todos',
    'catalog.search_label': 'Buscar bancos',
    'catalog.search_placeholder': 'Buscar por título, descripción o etiquetas',
    'catalog.mode_label': 'Tipo de banco',
    'catalog.only_public': 'Solo públicos',
    'catalog.only_protected': 'Solo protegidos',
    'catalog.clear': 'Limpiar filtros',
    'catalog.eyebrow': 'Catálogo',
    'catalog.title': 'Bancos de preguntas',
    'catalog.empty': 'No hay bancos que coincidan con los filtros actuales.',
    'catalog.no_description': 'Sin descripción.',
    'catalog.badge_public': 'Banco público',
    'catalog.badge_protected': '🔒 Requiere contraseña',
    'catalog.open_public': 'Comenzar práctica',
    'catalog.open_protected': 'Desbloquear banco',
    'catalog.resume': 'Continuar sesión',
    'catalog.bank_count': '{count} bancos',
    'catalog.not_found': 'Banco no encontrado: {bankId}',
    'recent.eyebrow': 'Reciente',
    'recent.title': 'Continuar donde lo dejaste',
    'recent.last_opened': 'Última apertura: {time}',
    'recent.badge_public': 'Banco público',
    'recent.badge_protected': '🔒 Banco protegido',
    'recent.continue': 'Continuar',
    'player.back_to_catalog': 'Volver al catálogo',
    'player.mode_public': 'Banco público',
    'player.mode_protected': 'Banco protegido',
    'player.default_description': 'Esta plantilla admite publicación mixta de bancos públicos y protegidos por contraseña.',
    'player.open_nav': 'Mapa de preguntas',
    'player.reset_filters': 'Restablecer filtros',
    'player.finish_exam': 'Entregar examen',
    'player.empty': 'No hay preguntas que coincidan con los filtros actuales.',
    'stats.answered': 'Respondidas / Total',
    'stats.accuracy': 'Precisión',
    'stats.review': 'Favoritas / Incorrectas',
    'mode.eyebrow': 'Modo',
    'mode.title': 'Modo de estudio',
    'mode.all': 'Práctica',
    'mode.wrong': 'Solo incorrectas',
    'mode.starred': 'Solo favoritas',
    'mode.random': 'Aleatorio',
    'mode.random150': 'Aleatorio 150',
    'mode.random150_current': 'Volver al 150 actual',
    'mode.random150_reroll': 'Rehacer 150',
    'mode.auto_on': 'Auto Submit: ON',
    'mode.auto_off': 'Auto Submit: OFF',
    'mode.exam': 'Examen simulado',
    'mode.resume': 'Continuar sesión',
    'mode.exam_count': 'Tamaño del examen',
    'filter.eyebrow': 'Filtro',
    'filter.title': 'Filtros de preguntas',
    'filter.search_label': 'Buscar en enunciado / opciones / fuente',
    'filter.search_placeholder': 'p. ej. hydraulics / draw / checklist',
    'filter.images_only': 'Solo con imágenes',
    'filter.unanswered_only': 'Solo sin responder',
    'filter.type': 'Tipo',
    'filter.tag': 'Etiqueta',
    'filter.section': 'Sección',
    'navigate.eyebrow': 'Navegar',
    'navigate.title': 'Mapa de preguntas',
    'navigate.count': '{count} preguntas',
    'current.eyebrow': 'Actual',
    'question.star_aria': 'Marcar la pregunta actual',
    'question.show_answer': 'Mostrar respuesta',
    'question.redo': 'Rehacer pregunta',
    'question.remove_wrong': 'Quitar de incorrectas',
    'question.submit': 'Enviar respuesta',
    'question.save': 'Guardar respuesta',
    'question.image_alt': 'Imagen de la pregunta {index}',
    'question.no_source': 'Sin fuente',
    'keyboard.choice': '1-9 elegir',
    'keyboard.submit': 'Enter enviar',
    'keyboard.nav': 'J/K navegar',
    'keyboard.star': 'S favorita',
    'pager.prev': 'Anterior',
    'pager.next': 'Siguiente',
    'password.eyebrow': 'Banco protegido',
    'password.title': 'Introduce la contraseña',
    'password.prompt': '{title} está protegido. Introduce la contraseña proporcionada por el autor para desbloquearlo.',
    'password.label': 'Contraseña',
    'password.placeholder': 'Introduce la contraseña del banco',
    'password.remember': 'Recordar la contraseña solo en esta pestaña',
    'password.cancel': 'Cancelar',
    'password.submit': 'Entrar',
    'password.hint': 'Pista: {hint}',
    'password.no_hint': 'No hay pista pública disponible.',
    'password.required': 'Introduce la contraseña del banco.',
    'password.decrypt_fail': 'No se pudo descifrar este banco.',
    'status.answer_required': 'Responde la pregunta antes de enviarla.',
    'status.correct': 'Esta respuesta es correcta.',
    'status.wrong': 'Esta respuesta es incorrecta.',
    'feedback.correct_title': 'Correcto',
    'feedback.wrong_title': 'Incorrecto',
    'feedback.reference_title': 'Respuesta de referencia',
    'feedback.fill_correct': 'Todos los espacios son correctos.',
    'feedback.correct_answers': 'Respuesta correcta: {value}',
    'feedback.answer_matches': 'La respuesta coincide.',
    'feedback.blank_label': 'Espacio {index}',
    'feedback.empty': '(vacío)',
    'explanation.label': 'Explicación',
    'summary.eyebrow': 'Resultado',
    'summary.title': 'Resumen del examen',
    'summary.answered': 'Respondidas',
    'summary.correct': 'Correctas',
    'summary.accuracy': 'Precisión',
    'summary.wrong': 'Incorrectas',
    'summary.retry_wrong': 'Repetir incorrectas',
    'summary.back_practice': 'Volver a práctica',
    'type.single': 'Opción única',
    'type.multi': 'Opción múltiple',
    'type.fill': 'Rellenar espacios',
    'misc.questions_unit': '{count} preguntas',
    'misc.has_images': 'Con imágenes',
    'misc.unknown': 'Desconocido',
    'error.load_manifest': 'No se pudo cargar el catálogo: {status}',
    'error.load_bank': 'No se pudo cargar el banco: {status}',
    'error.not_found': 'Banco no encontrado: {bankId}',
    'error.generic_load': 'No se pudo cargar el banco.',
    'lightbox.close': 'Cerrar vista previa de imagen',
  },
};

const runtime = createSiteRuntime(globalThis);

function detectInitialLocale() {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(SITE_LOCALE_KEY) : '';
  if (SUPPORTED_LOCALES.includes(saved)) return saved;
  const lang = String((globalThis.navigator && globalThis.navigator.language) || 'en').toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('es')) return 'es';
  return 'en';
}

const refs = {};
const state = {
  locale: detectInitialLocale(),
  manifest: [],
  entryById: new Map(),
  currentEntry: null,
  questions: [],
  questionMap: new Map(),
  questionAlias: {},
  session: makeEmptySession(),
  starred: new Set(),
  wrong: new Set(),
  attempts: {},
  prefs: {
    focusMode: false,
    autoSubmit: false,
  },
  passwordPromptEntry: null,
  reviewScopeIds: [],
  random150Draw: {
    sourceIds: [],
    ids: [],
  },
  autoSubmitTimers: new Map(),
  timerHandle: 0,
};

export async function initQuestionBankSite() {
  cacheRefs();
  refs.siteLocaleSelect.value = state.locale;
  applyStaticTranslations();
  bindEvents();
  await loadManifest();
  await handleRouteFromLocation({ replaceHistory: true });
}

function cacheRefs() {
  [
    'catalogView',
    'siteLocaleSelect',
    'globalFocusBtn',
    'catalogSearch',
    'catalogMode',
    'catalogClearBtn',
    'recentPanel',
    'recentList',
    'catalogCount',
    'catalogList',
    'catalogEmpty',
    'playerView',
    'backToCatalogBtn',
    'focusModeBtn',
    'playerModeLabel',
    'bankTitle',
    'bankDescription',
    'answeredStat',
    'accuracyStat',
    'reviewStat',
    'questionSearch',
    'filterImagesOnly',
    'filterUnanswered',
    'typeFilter',
    'tagFilter',
    'sectionFilter',
    'questionNavMeta',
    'questionNav',
    'currentModeTitle',
    'timerPill',
    'autoSubmitToggle',
    'random150CurrentBtn',
    'random150RerollBtn',
    'openNavBtn',
    'resetFiltersBtn',
    'finishExamBtn',
    'bankStatus',
    'playerEmpty',
    'questionCard',
    'questionOrdinal',
    'questionType',
    'questionSource',
    'starQuestionBtn',
    'questionText',
    'questionImages',
    'questionChoices',
    'fillArea',
    'feedbackPanel',
    'explanationPanel',
    'showAnswerBtn',
    'redoQuestionBtn',
    'removeWrongBtn',
    'submitQuestionBtn',
    'prevQuestionBtn',
    'nextQuestionBtn',
    'pager',
    'pagerMeta',
    'examSummary',
    'passwordModal',
    'passwordPromptText',
    'passwordInput',
    'rememberPasswordInput',
    'cancelPasswordBtn',
    'submitPasswordBtn',
    'passwordHintText',
    'passwordError',
    'imageLightbox',
    'lightboxImage',
    'closeLightboxBtn',
    'examCountSelect',
  ].forEach((id) => {
    refs[id] = document.getElementById(id);
  });
}

function bindEvents() {
  refs.siteLocaleSelect.addEventListener('change', () => {
    setLocale(refs.siteLocaleSelect.value || 'en');
  });
  refs.globalFocusBtn.addEventListener('click', toggleFocusMode);
  refs.catalogSearch.addEventListener('input', renderCatalog);
  refs.catalogMode.addEventListener('change', renderCatalog);
  refs.catalogClearBtn.addEventListener('click', () => {
    refs.catalogSearch.value = '';
    refs.catalogMode.value = 'all';
    renderCatalog();
  });

  refs.backToCatalogBtn.addEventListener('click', () => showCatalog());
  refs.focusModeBtn.addEventListener('click', toggleFocusMode);
  refs.openNavBtn.addEventListener('click', () => {
    document.querySelector('.player-sidebar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  refs.resetFiltersBtn.addEventListener('click', resetPlayerFilters);
  refs.finishExamBtn.addEventListener('click', finishExamSession);

  refs.questionSearch.addEventListener('input', onFilterChange);
  refs.filterImagesOnly.addEventListener('change', onFilterChange);
  refs.filterUnanswered.addEventListener('change', onFilterChange);
  refs.typeFilter.addEventListener('change', onFilterChange);
  refs.tagFilter.addEventListener('change', onFilterChange);
  refs.sectionFilter.addEventListener('change', onFilterChange);
  refs.examCountSelect.addEventListener('change', () => {
    state.session.exam.questionCount = Math.max(1, parseInt(refs.examCountSelect.value || '20', 10) || 20);
    saveSessionState();
  });

  refs.starQuestionBtn.addEventListener('click', toggleCurrentQuestionStar);
  refs.showAnswerBtn.addEventListener('click', showCurrentAnswer);
  refs.redoQuestionBtn.addEventListener('click', redoCurrentQuestion);
  refs.removeWrongBtn.addEventListener('click', removeCurrentFromWrong);
  refs.submitQuestionBtn.addEventListener('click', submitCurrentQuestion);
  refs.prevQuestionBtn.addEventListener('click', () => moveQuestion(-1));
  refs.nextQuestionBtn.addEventListener('click', () => moveQuestion(1));
  refs.autoSubmitToggle.addEventListener('click', toggleAutoSubmit);
  refs.random150CurrentBtn.addEventListener('click', activateCurrentRandom150);
  refs.random150RerollBtn.addEventListener('click', () => resetSessionForMode('random150', { reuseRandom150: false }));

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-mode') || 'all';
      activateMode(mode);
    });
  });

  refs.cancelPasswordBtn.addEventListener('click', () => {
    closePasswordModal();
    showCatalog();
  });
  refs.submitPasswordBtn.addEventListener('click', submitProtectedPassword);
  refs.passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitProtectedPassword();
    }
  });

  refs.closeLightboxBtn.addEventListener('click', closeLightbox);
  refs.imageLightbox.addEventListener('click', (event) => {
    if (event.target === refs.imageLightbox) closeLightbox();
  });

  window.addEventListener('popstate', () => {
    handleRouteFromLocation({ replaceHistory: true }).catch(console.error);
  });

  document.addEventListener('keydown', handleKeyboardShortcuts);
}

function t(key, vars = {}) {
  const table = I18N[state.locale] || I18N.en;
  const fallback = I18N.en[key] || key;
  const template = table[key] || fallback;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function applyStaticTranslations() {
  document.documentElement.lang = state.locale === 'zh' ? 'zh-CN' : state.locale;
  document.body.dataset.locale = state.locale;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (key) node.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    const key = node.getAttribute('data-i18n-placeholder');
    if (key) node.setAttribute('placeholder', t(key));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
    const key = node.getAttribute('data-i18n-aria-label');
    if (key) node.setAttribute('aria-label', t(key));
  });
}

function setLocale(locale) {
  const next = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  state.locale = next;
  try {
    localStorage.setItem(SITE_LOCALE_KEY, next);
  } catch (_error) {
    // Ignore storage failures for locale preference.
  }
  refs.siteLocaleSelect.value = next;
  applyStaticTranslations();
  refreshViewAfterLocaleChange();
}

function refreshViewAfterLocaleChange() {
  if (!refs.passwordModal.hidden && state.passwordPromptEntry) {
    openPasswordModal(state.passwordPromptEntry);
  }
  if (!refs.playerView.hidden && state.currentEntry) {
    renderPlayer();
  } else {
    renderCatalog();
  }
}

async function loadManifest() {
  const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(t('error.load_manifest', { status: response.status }));
  }
  const manifest = await response.json();
  state.manifest = Array.isArray(manifest) ? manifest : [];
  state.entryById = new Map(state.manifest.map((entry) => [String(entry.id || ''), entry]));
  renderCatalog();
}

async function handleRouteFromLocation({ replaceHistory = false } = {}) {
  const url = new URL(window.location.href);
  const bankId = url.searchParams.get('bank');
  if (!bankId) {
    showCatalog({ replaceHistory });
    return;
  }
  await openBankById(bankId, { replaceHistory, resumeIfPossible: true });
}

function showCatalog({ replaceHistory = false } = {}) {
  clearTimerLoop();
  refs.catalogView.hidden = false;
  refs.playerView.hidden = true;
  refs.passwordModal.hidden = true;
  refs.passwordModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('site-player-active');
  refs.globalFocusBtn.disabled = true;
  applyFocusMode();
  if (replaceHistory) {
    const url = new URL(window.location.href);
    url.searchParams.delete('bank');
    window.history.replaceState({}, '', url);
  } else if (new URL(window.location.href).searchParams.get('bank')) {
    const url = new URL(window.location.href);
    url.searchParams.delete('bank');
    window.history.pushState({}, '', url);
  }
  renderCatalog();
}

async function openBankById(bankId, { replaceHistory = false, resumeIfPossible = true } = {}) {
  const entry = state.entryById.get(String(bankId || '').trim());
  if (!entry) {
    refs.catalogEmpty.hidden = false;
    refs.catalogEmpty.textContent = t('error.not_found', { bankId });
    showCatalog({ replaceHistory: true });
    return;
  }

  updateRouteForBank(entry.id, replaceHistory);

  if (entry.mode === 'protected') {
    const stored = getSessionPassword(entry.id);
    if (stored) {
      try {
        await loadProtectedBank(entry, stored);
        return;
      } catch (_error) {
        clearSessionPassword(entry.id);
      }
    }
    openPasswordModal(entry);
    return;
  }

  const questions = await fetchJSON(entry.json);
  enterBank(entry, questions, { resumeIfPossible });
}

function updateRouteForBank(bankId, replaceHistory) {
  const url = new URL(window.location.href);
  url.searchParams.set('bank', bankId);
  if (replaceHistory) window.history.replaceState({}, '', url);
  else window.history.pushState({}, '', url);
}

function openPasswordModal(entry) {
  state.passwordPromptEntry = entry;
  refs.globalFocusBtn.disabled = true;
  refs.passwordPromptText.textContent = t('password.prompt', { title: entry.title || entry.id });
  refs.passwordHintText.textContent = entry.password_hint ? t('password.hint', { hint: entry.password_hint }) : t('password.no_hint');
  refs.passwordInput.value = '';
  refs.rememberPasswordInput.checked = false;
  refs.passwordError.hidden = true;
  refs.passwordError.textContent = '';
  refs.passwordModal.hidden = false;
  refs.passwordModal.setAttribute('aria-hidden', 'false');
  refs.playerView.hidden = true;
  refs.catalogView.hidden = false;
  queueMicrotask(() => refs.passwordInput.focus());
}

function closePasswordModal() {
  refs.passwordModal.hidden = true;
  refs.passwordModal.setAttribute('aria-hidden', 'true');
  refs.passwordError.hidden = true;
  refs.passwordError.textContent = '';
  state.passwordPromptEntry = null;
}

async function submitProtectedPassword() {
  if (!state.passwordPromptEntry) return;
  const password = refs.passwordInput.value || '';
  if (!password.trim()) {
    setPasswordError(t('password.required'));
    return;
  }
  refs.submitPasswordBtn.disabled = true;
  try {
    await loadProtectedBank(state.passwordPromptEntry, password, refs.rememberPasswordInput.checked);
    closePasswordModal();
  } catch (_error) {
    setPasswordError(t('password.decrypt_fail'));
  } finally {
    refs.submitPasswordBtn.disabled = false;
  }
}

function setPasswordError(message) {
  refs.passwordError.hidden = false;
  refs.passwordError.className = 'status-banner is-error';
  refs.passwordError.dataset.kind = 'error';
  refs.passwordError.textContent = message;
}

async function loadProtectedBank(entry, password, remember = false) {
  const response = await fetch(entry.payload, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(t('error.load_bank', { status: response.status }));
  }
  const payloadText = await response.text();
  const questions = await decryptQuestionBankPayload(payloadText, password);
  if (remember) saveSessionPassword(entry.id, password);
  else clearSessionPassword(entry.id);
  enterBank(entry, questions, { resumeIfPossible: true });
}

function enterBank(entry, questions, { resumeIfPossible = true } = {}) {
  state.currentEntry = entry;
  const normalized = normalizeQuestionBankForRuntime(Array.isArray(questions) ? questions.filter(Boolean) : []);
  state.questions = normalized.questions;
  state.questionAlias = normalized.alias;
  state.questionMap = new Map(state.questions.map((question) => [String(question.id || ''), question]));
  state.reviewScopeIds = [];
  state.random150Draw = { sourceIds: [], ids: [] };

  migrateLegacyState(entry.id);
  loadBankScopedState(entry.id);
  hydrateFilterOptions();

  const persistedSession = sanitizeSession(loadJSON(sessionKey(entry.id, 'session'), makeEmptySession()));
  applyAliasToSession(persistedSession);
  const canResume = resumeIfPossible && persistedSession.ids.length > 0;
  state.session = canResume ? persistedSession : makeEmptySession();
  if (!canResume) {
    state.session.exam.questionCount = Math.max(1, parseInt(refs.examCountSelect.value || '20', 10) || 20);
  }
  if (!canResume) {
    resetSessionForMode('all');
  } else {
    reconcileSessionWithQuestionBank();
    if (!state.session.ids.length) resetSessionForMode('all');
  }

  saveRecentBank(entry);
  refs.catalogView.hidden = true;
  refs.playerView.hidden = false;
  document.body.classList.add('site-player-active');
  refs.globalFocusBtn.disabled = false;
  applyFocusMode();
  renderPlayer();
}

function reconcileSessionWithQuestionBank() {
  const validIds = new Set(state.questions.map((question) => String(question.id || '')));
  state.session.ids = state.session.ids.filter((id) => validIds.has(id));
  if (!state.session.currentId || !validIds.has(state.session.currentId)) {
    state.session.currentId = state.session.ids[0] || '';
  }
  Object.keys(state.session.answers || {}).forEach((id) => {
    if (!validIds.has(id)) delete state.session.answers[id];
  });
  saveSessionState();
}

function makeEmptySession() {
  return createEmptySession();
}

function sanitizeSession(raw) {
  return sanitizeStoredSession(raw);
}

function resolveQuestionId(id) {
  const key = String(id || '');
  return String((state.questionAlias && state.questionAlias[key]) || key);
}

function applyAliasToSession(session) {
  const validIds = new Set(state.questions.map((question) => String(question.id || '')));
  const mapped = applyQuestionIdAliasToState({
    validIds,
    alias: state.questionAlias,
    ids: session.ids,
    attempts: {},
    answers: session.answers,
  });
  session.ids = mapped.ids;
  session.answers = mapped.answers;
  session.currentId = validIds.has(resolveQuestionId(session.currentId)) ? resolveQuestionId(session.currentId) : (session.ids[0] || '');
  session.random150.sourceIds = sanitizeIdList(session.random150.sourceIds)
    .map(resolveQuestionId)
    .filter((id, index, arr) => validIds.has(id) && arr.indexOf(id) === index);
  session.random150.ids = sanitizeIdList(session.random150.ids)
    .map(resolveQuestionId)
    .filter((id, index, arr) => validIds.has(id) && arr.indexOf(id) === index);
  if (session.random150.ids.length) {
    state.random150Draw = {
      sourceIds: session.random150.sourceIds.slice(),
      ids: session.random150.ids.slice(),
    };
  }
  return session;
}

function loadBankScopedState(bankId) {
  const validIds = new Set(state.questions.map((question) => String(question.id || '')));
  const mapped = applyQuestionIdAliasToState({
    validIds,
    alias: state.questionAlias,
    starred: new Set(sanitizeIdList(loadJSON(sessionKey(bankId, 'starred'), []))),
    wrong: new Set(sanitizeIdList(loadJSON(sessionKey(bankId, 'wrong'), []))),
    attempts: sanitizeAttemptMap(loadJSON(sessionKey(bankId, 'attempts'), {})),
  });
  state.starred = mapped.starred;
  state.wrong = mapped.wrong;
  state.attempts = mapped.attempts;
  state.prefs = sanitizePlayerPrefs(loadJSON(sessionKey(bankId, 'prefs'), {}));
  saveStarredSet();
  saveWrongSet();
  saveAttemptMap();
}

function migrateLegacyState(bankId) {
  const migrationKey = sessionKey(bankId, 'legacy-migrated');
  if (loadJSON(migrationKey, false)) return;

  const questionIds = new Set(state.questions.map((question) => String(question.id || '')));
  const starred = new Set(sanitizeIdList(loadJSON(sessionKey(bankId, 'starred'), [])));
  const wrong = new Set(sanitizeIdList(loadJSON(sessionKey(bankId, 'wrong'), [])));
  const attempts = sanitizeAttemptMap(loadJSON(sessionKey(bankId, 'attempts'), {}));
  const legacyStarred = sanitizeIdList(loadJSON(LEGACY_STAR_KEY, []));
  const legacyWrong = sanitizeIdList(loadJSON(LEGACY_WRONG_KEY, []));
  const legacyAttempts = sanitizeAttemptMap(loadJSON(LEGACY_ATTEMPT_KEY, {}));

  legacyStarred.map(String).forEach((id) => {
    const mapped = resolveQuestionId(id);
    if (questionIds.has(mapped)) starred.add(mapped);
  });
  legacyWrong.map(String).forEach((id) => {
    const mapped = resolveQuestionId(id);
    if (questionIds.has(mapped)) wrong.add(mapped);
  });
  Object.entries(legacyAttempts || {}).forEach(([id, count]) => {
    const mapped = resolveQuestionId(id);
    if (!questionIds.has(mapped)) return;
    const next = Math.max(0, Number(count || 0));
    if (!Number.isFinite(next) || next <= 0) return;
    attempts[mapped] = Math.max(next, Number(attempts[mapped] || 0));
  });

  const legacyAuto = !!loadJSON(LEGACY_AUTO_KEY, false);
  saveJSON(sessionKey(bankId, 'starred'), [...starred]);
  saveJSON(sessionKey(bankId, 'wrong'), [...wrong]);
  saveJSON(sessionKey(bankId, 'attempts'), attempts);
  saveJSON(sessionKey(bankId, 'prefs'), { focusMode: false, autoSubmit: legacyAuto });
  saveJSON(migrationKey, true);
}

function hydrateFilterOptions() {
  const tags = Array.from(new Set(state.questions.flatMap((question) => asArray(question.tags).map(String).map((value) => value.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const sections = Array.from(new Set(state.questions.map((question) => String(question.section || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  refillSelect(refs.tagFilter, ['all', ...tags]);
  refillSelect(refs.sectionFilter, ['all', ...sections]);
}

function refillSelect(select, values) {
  const current = select.value || 'all';
  select.innerHTML = '';
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'all' ? t('common.all') : value;
    select.appendChild(option);
  });
  select.value = values.includes(current) ? current : 'all';
}

function saveRecentBank(entry) {
  const items = loadJSON(RECENT_BANKS_KEY, []);
  const next = [
    { id: entry.id, title: entry.title, mode: entry.mode, lastOpenedAt: runtime.now() },
    ...items.filter((item) => item && item.id !== entry.id),
  ].slice(0, 6);
  saveJSON(RECENT_BANKS_KEY, next);
}

function renderCatalog() {
  const query = String(refs.catalogSearch.value || '').trim().toLowerCase();
  const mode = refs.catalogMode.value || 'all';
  const cards = state.manifest.filter((entry) => {
    if (mode !== 'all' && entry.mode !== mode) return false;
    const haystack = [
      entry.title,
      entry.description,
      ...(Array.isArray(entry.tags) ? entry.tags : []),
      entry.mode,
    ].join('\n').toLowerCase();
    return !query || haystack.includes(query);
  });

  refs.catalogList.innerHTML = '';
  refs.catalogCount.textContent = t('catalog.bank_count', { count: cards.length });
  refs.catalogEmpty.hidden = cards.length > 0;
  if (!cards.length) {
    refs.catalogEmpty.textContent = t('catalog.empty');
  }

  cards.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'catalog-card';
    card.dataset.testid = 'catalog-card';
    card.dataset.bankId = String(entry.id || '');
    card.dataset.bankMode = String(entry.mode || 'public');
    const canResume = hasSavedSession(entry.id);
    card.innerHTML = `
      <div class="catalog-card__head">
        <div>
          <h3>${escapeHTML(entry.title || entry.id)}</h3>
          <p class="catalog-card__desc">${escapeHTML(entry.description || t('catalog.no_description'))}</p>
        </div>
        <span class="pill ${entry.mode === 'protected' ? 'pill--locked' : ''}">${entry.mode === 'protected' ? t('catalog.badge_protected') : t('catalog.badge_public')}</span>
      </div>
      <div class="catalog-card__stats">
        <span class="pill">${t('misc.questions_unit', { count: Number(entry.question_count || 0) })}</span>
        ${(entry.has_images ? `<span class="pill">${escapeHTML(t('misc.has_images'))}</span>` : '')}
        ${Array.isArray(entry.tags) ? entry.tags.slice(0, 3).map((tag) => `<span class="pill pill--muted">${escapeHTML(tag)}</span>`).join('') : ''}
      </div>
      <div class="catalog-card__actions">
        <button class="button button--primary" type="button" data-testid="open-bank-btn" data-open="${escapeHTML(entry.id)}">${entry.mode === 'protected' ? t('catalog.open_protected') : t('catalog.open_public')}</button>
        ${canResume ? `<button class="button button--ghost" type="button" data-testid="resume-bank-btn" data-resume="${escapeHTML(entry.id)}">${escapeHTML(t('catalog.resume'))}</button>` : ''}
      </div>
    `;
    card.querySelector('[data-open]')?.addEventListener('click', () => {
      openBankById(entry.id).catch(handleOpenError);
    });
    card.querySelector('[data-resume]')?.addEventListener('click', () => {
      openBankById(entry.id, { resumeIfPossible: true }).catch(handleOpenError);
    });
    refs.catalogList.appendChild(card);
  });

  renderRecentPanel();
}

function renderRecentPanel() {
  const items = loadJSON(RECENT_BANKS_KEY, []).filter((item) => item && state.entryById.has(item.id));
  refs.recentList.innerHTML = '';
  refs.recentPanel.hidden = items.length === 0;
  items.forEach((item) => {
    const entry = state.entryById.get(item.id);
    const card = document.createElement('article');
    card.className = 'catalog-card';
    card.dataset.testid = 'recent-card';
    card.dataset.bankId = String(entry.id || '');
    card.innerHTML = `
      <div class="catalog-card__head">
        <div>
          <h3>${escapeHTML(entry.title || entry.id)}</h3>
          <p class="catalog-card__desc">${escapeHTML(t('recent.last_opened', { time: formatDateTime(item.lastOpenedAt) }))}</p>
        </div>
        <span class="pill ${entry.mode === 'protected' ? 'pill--locked' : ''}">${entry.mode === 'protected' ? t('recent.badge_protected') : t('recent.badge_public')}</span>
      </div>
      <div class="catalog-card__actions">
        <button class="button button--primary" type="button" data-testid="continue-recent-btn">${escapeHTML(t('recent.continue'))}</button>
      </div>
    `;
    card.querySelector('button')?.addEventListener('click', () => {
      openBankById(entry.id, { resumeIfPossible: true }).catch(handleOpenError);
    });
    refs.recentList.appendChild(card);
  });
}

function hasSavedSession(bankId) {
  const session = sanitizeSession(loadJSON(sessionKey(bankId, 'session'), makeEmptySession()));
  return session.ids.length > 0 || Object.keys(session.answers || {}).length > 0;
}

function handleOpenError(error) {
  console.error(error);
  refs.catalogEmpty.hidden = false;
  refs.catalogEmpty.textContent = error && error.message ? error.message : t('error.generic_load');
}

function resetPlayerFilters() {
  state.session.filters = makeEmptySession().filters;
  syncFilterControls();
  if (!(state.session.exam.active && !state.session.exam.submitted)) {
    recomputeIdsForCurrentMode();
  } else {
    saveSessionState();
    renderPlayer();
  }
}

function onFilterChange() {
  state.session.filters.search = refs.questionSearch.value || '';
  state.session.filters.imagesOnly = !!refs.filterImagesOnly.checked;
  state.session.filters.unansweredOnly = !!refs.filterUnanswered.checked;
  state.session.filters.type = refs.typeFilter.value || 'all';
  state.session.filters.tag = refs.tagFilter.value || 'all';
  state.session.filters.section = refs.sectionFilter.value || 'all';
  if (!(state.session.exam.active && !state.session.exam.submitted)) {
    recomputeIdsForCurrentMode();
  } else {
    saveSessionState();
    renderPlayer();
  }
}

function activateMode(mode) {
  if (mode === 'resume') {
    const persisted = sanitizeSession(loadJSON(sessionKey(currentBankId(), 'session'), makeEmptySession()));
    applyAliasToSession(persisted);
    state.session = persisted.ids.length ? persisted : state.session;
    if (!state.session.ids.length) resetSessionForMode('all');
    reconcileSessionWithQuestionBank();
    renderPlayer();
    return;
  }
  if (mode === 'wrong' || mode === 'starred') {
    state.reviewScopeIds = getReviewScopeIdsForCurrentView();
  } else if (mode !== 'random150') {
    state.reviewScopeIds = [];
  }
  resetSessionForMode(mode);
}

function resetSessionForMode(mode, { reuseRandom150 = false } = {}) {
  const scopeIds = (mode === 'wrong' || mode === 'starred') ? state.reviewScopeIds : [];
  const scopedQuestions = scopeIds.length
    ? state.questions.filter((question) => scopeIds.includes(String(question.id || '')))
    : state.questions;
  const randomSourceIds = mode === 'random150'
    ? (reuseRandom150 && state.random150Draw.sourceIds.length ? state.random150Draw.sourceIds : getRandom150SourceIds())
    : [];
  const randomIds = mode === 'random150' && reuseRandom150 ? state.random150Draw.ids : [];
  state.session = createSessionForMode({
    mode,
    questions: scopedQuestions,
    filters: { ...state.session.filters },
    answers: state.session.answers || {},
    wrong: state.wrong,
    starred: state.starred,
    examCount: Math.max(1, parseInt(refs.examCountSelect.value || '20', 10) || 20),
    attempts: state.attempts,
    random150Limit: runtime.random150Limit,
    random150SourceIds: randomSourceIds,
    random150Ids: randomIds,
    now: runtime.now,
    rng: runtime.rng,
    isQuestionTouched,
  });
  if (mode === 'random150') {
    state.random150Draw = {
      sourceIds: state.session.random150.sourceIds.slice(),
      ids: state.session.random150.ids.slice(),
    };
  }
  saveSessionState();
  renderPlayer();
}

function recomputeIdsForCurrentMode() {
  if (state.session.mode === 'wrong' || state.session.mode === 'starred') {
    const scopedQuestions = state.reviewScopeIds.length
      ? state.questions.filter((question) => state.reviewScopeIds.includes(String(question.id || '')))
      : state.questions;
    state.session = recomputePlayerSessionIds({
      session: state.session,
      questions: scopedQuestions,
      wrong: state.wrong,
      starred: state.starred,
      rng: runtime.rng,
      isQuestionTouched,
    });
    saveSessionState();
    renderPlayer();
    return;
  }
  state.session = recomputePlayerSessionIds({
    session: state.session,
    questions: state.questions,
    wrong: state.wrong,
    starred: state.starred,
    rng: runtime.rng,
    isQuestionTouched,
  });
  saveSessionState();
  renderPlayer();
}

function getReviewScopeIdsForCurrentView() {
  if (state.session.mode === 'random150' && state.session.random150.sourceIds.length) {
    return state.session.random150.sourceIds.slice();
  }
  return state.session.ids.slice();
}

function getRandom150SourceIds() {
  if (state.session.mode === 'random150' && state.session.random150.sourceIds.length) {
    return state.session.random150.sourceIds.slice();
  }
  return state.session.ids.length ? state.session.ids.slice() : state.questions.map((question) => String(question.id || ''));
}

function activateCurrentRandom150() {
  if (!state.random150Draw.ids.length) return;
  resetSessionForMode('random150', { reuseRandom150: true });
}

function getModeBaseQuestions(mode, filters) {
  return getFilteredQuestionsForMode(state.questions, mode, filters, {
    wrong: state.wrong,
    starred: state.starred,
    isQuestionTouched,
  });
}

function questionMatchesFilters(question, filters) {
  return matchesQuestionFilters(question, filters, { isQuestionTouched });
}

function renderPlayer() {
  if (!state.currentEntry) return;
  syncFilterControls();
  applyFocusMode();
  refs.playerView.dataset.mode = String(state.session.mode || 'all');
  refs.playerView.dataset.bankId = String(state.currentEntry.id || '');
  refs.playerView.dataset.bankMode = String(state.currentEntry.mode || 'public');
  refs.playerView.dataset.examState = state.session.exam.active ? (state.session.exam.submitted ? 'submitted' : 'running') : 'inactive';
  refs.bankTitle.textContent = state.currentEntry.title || state.currentEntry.id;
  refs.bankDescription.textContent = state.currentEntry.description || t('player.default_description');
  refs.playerModeLabel.textContent = state.currentEntry.mode === 'protected' ? t('player.mode_protected') : t('player.mode_public');
  refs.currentModeTitle.textContent = modeLabel(state.session.mode);
  renderModeButtons();
  renderStats();
  renderQuestionNav();
  renderQuestionCard();
  renderExamSummary();
  persistAllPlayerState();
}

function renderModeButtons() {
  document.querySelectorAll('.mode-btn').forEach((button) => {
    const isActive = (button.getAttribute('data-mode') || '') === state.session.mode;
    button.classList.toggle('button--primary', isActive);
    button.classList.toggle('button--ghost', !isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.dataset.state = isActive ? 'active' : 'inactive';
    if ((button.getAttribute('data-mode') || '') === 'random150') {
      button.disabled = getRandom150SourceIds().length <= runtime.random150Limit;
    }
  });
  refs.autoSubmitToggle.textContent = state.prefs.autoSubmit ? t('mode.auto_on') : t('mode.auto_off');
  refs.autoSubmitToggle.classList.toggle('button--primary', !!state.prefs.autoSubmit);
  refs.autoSubmitToggle.classList.toggle('button--ghost', !state.prefs.autoSubmit);
  refs.autoSubmitToggle.setAttribute('aria-pressed', state.prefs.autoSubmit ? 'true' : 'false');
  refs.random150CurrentBtn.disabled = !state.random150Draw.ids.length || state.session.mode === 'random150';
  refs.random150RerollBtn.disabled = getRandom150SourceIds().length <= runtime.random150Limit;
}

function renderStats() {
  const currentIds = state.session.ids;
  const answered = currentIds.filter((id) => isQuestionTouched(id)).length;
  const scored = Object.entries(state.session.answers || {}).filter(([, answerState]) => answerState && answerState.submitted);
  const correct = scored.filter(([, answerState]) => !!answerState.isCorrect).length;
  refs.answeredStat.textContent = `${answered} / ${currentIds.length}`;
  refs.accuracyStat.textContent = scored.length ? `${Math.round((correct / scored.length) * 100)}%` : '0%';
  const scopeQuestions = getCurrentReviewScopeQuestions();
  const review = computeScopedReviewCounts({
    allQuestions: state.questions,
    scopeQuestions,
    starred: state.starred,
    wrong: state.wrong,
  });
  refs.reviewStat.textContent = `${review.starredInScope} / ${review.wrongInScope}`;
  refs.reviewStat.title = `${review.starredInScope} / ${review.wrongInScope} in current scope; ${review.starredTotal} / ${review.wrongTotal} total`;

  const examRunning = state.session.exam.active && !state.session.exam.submitted;
  refs.finishExamBtn.hidden = !examRunning;
  refs.timerPill.hidden = !state.session.exam.active;
  if (state.session.exam.active) startTimerLoop();
  else clearTimerLoop();
}

function getCurrentReviewScopeQuestions() {
  if ((state.session.mode === 'wrong' || state.session.mode === 'starred') && state.reviewScopeIds.length) {
    const scope = new Set(state.reviewScopeIds);
    return state.questions.filter((question) => scope.has(String(question.id || '')));
  }
  if (state.session.mode === 'random150' && state.session.random150.sourceIds.length) {
    const scope = new Set(state.session.random150.sourceIds);
    return state.questions.filter((question) => scope.has(String(question.id || '')));
  }
  const visible = new Set(state.session.ids);
  return state.questions.filter((question) => visible.has(String(question.id || '')));
}

function startTimerLoop() {
  updateTimerPill();
  if (state.timerHandle) return;
  state.timerHandle = window.setInterval(updateTimerPill, 1000);
}

function clearTimerLoop() {
  if (state.timerHandle) {
    window.clearInterval(state.timerHandle);
    state.timerHandle = 0;
  }
}

function updateTimerPill() {
  if (!state.session.exam.active) {
    refs.timerPill.hidden = true;
    return;
  }
  const end = state.session.exam.submitted ? state.session.exam.finishedAt : runtime.now();
  const startedAt = state.session.exam.startedAt || runtime.now();
  refs.timerPill.hidden = false;
  refs.timerPill.textContent = formatDuration(Math.max(0, end - startedAt));
}

function renderQuestionNav() {
  refs.questionNav.innerHTML = '';
  refs.questionNavMeta.textContent = t('navigate.count', { count: state.session.ids.length });
  state.session.ids.forEach((id, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(index + 1);
    button.dataset.testid = 'question-nav-btn';
    button.dataset.questionId = id;
    const answerState = getAnswerState(id);
    button.classList.toggle('is-current', id === state.session.currentId);
    button.classList.toggle('is-starred', state.starred.has(id));
    button.classList.toggle('is-correct', !!(answerState && answerState.submitted && answerState.isCorrect));
    button.classList.toggle('is-wrong', !!(answerState && answerState.submitted && !answerState.isCorrect));
    button.classList.toggle('is-unanswered', !isQuestionTouched(id));
    button.addEventListener('click', () => {
      state.session.currentId = id;
      saveSessionState();
      renderPlayer();
    });
    refs.questionNav.appendChild(button);
  });
}

function renderQuestionCard() {
  const ids = state.session.ids;
  if (!ids.length) {
    refs.playerEmpty.hidden = false;
    refs.questionCard.hidden = true;
    refs.pager.hidden = true;
    return;
  }
  refs.playerEmpty.hidden = true;
  refs.questionCard.hidden = false;
  refs.pager.hidden = false;

  const currentId = ids.includes(state.session.currentId) ? state.session.currentId : ids[0];
  state.session.currentId = currentId;
  const question = state.questionMap.get(currentId);
  const answerState = ensureAnswerState(currentId);
  const ordinal = ids.indexOf(currentId) + 1;
  const examPending = state.session.exam.active && !state.session.exam.submitted;

  refs.questionOrdinal.textContent = `Q${ordinal}`;
  refs.questionCard.dataset.questionId = currentId;
  refs.questionCard.dataset.questionType = getQuestionType(question);
  refs.questionType.textContent = typeLabel(getQuestionType(question), isMultiQuestion(question));
  refs.questionSource.textContent = String(question.source || t('question.no_source'));
  refs.starQuestionBtn.classList.toggle('is-active', state.starred.has(currentId));
  refs.starQuestionBtn.innerHTML = `<span>${state.starred.has(currentId) ? '★' : '☆'}</span>`;

  renderQuestionText(question, answerState, examPending);
  renderQuestionImages(question);
  renderQuestionChoices(question, answerState, examPending);
  renderFillArea(question, answerState, examPending);
  renderFeedback(question, answerState, examPending);
  renderExplanation(question);

  refs.showAnswerBtn.hidden = examPending;
  refs.showAnswerBtn.disabled = false;
  refs.redoQuestionBtn.disabled = !!state.session.exam.submitted;
  refs.removeWrongBtn.hidden = !state.wrong.has(currentId) || examPending;
  refs.removeWrongBtn.disabled = !!state.session.exam.submitted;
  refs.submitQuestionBtn.textContent = examPending ? t('question.save') : t('question.submit');
  refs.submitQuestionBtn.disabled = !!state.session.exam.submitted;
  refs.pagerMeta.textContent = `${ordinal} / ${ids.length}`;
  refs.prevQuestionBtn.disabled = ordinal <= 1;
  refs.nextQuestionBtn.disabled = ordinal >= ids.length;
}

function renderQuestionText(question, answerState, examPending) {
  refs.questionText.innerHTML = '';
  if (question.question_html) {
    refs.questionText.innerHTML = sanitizeQuestionHtml(String(question.question_html || ''));
    hydrateInlineFillInputs(question, answerState, examPending);
    return;
  }
  const paragraph = document.createElement('p');
  paragraph.textContent = String(question.question || '');
  refs.questionText.appendChild(paragraph);
}

function hydrateInlineFillInputs(question, answerState, examPending) {
  if (getQuestionType(question) !== 'fill') return;
  const blanks = Array.isArray(question.blanks) ? question.blanks : [];
  if (!blanks.length) return;
  const values = Array.isArray(answerState.fills) ? answerState.fills : [];
  const inputs = Array.from(refs.questionText.querySelectorAll('input.qb-blank, input[data-blank], input[type="text"], input:not([type])'));
  inputs.forEach((input, renderIndex) => {
    let blankIndex = renderIndex;
    const attrIndex = input.getAttribute('data-blank');
    if (attrIndex && /^\d+$/.test(attrIndex)) blankIndex = Math.max(0, parseInt(attrIndex, 10) - 1);
    if (blankIndex >= blanks.length) return;
    input.type = 'text';
    input.classList.add('qb-blank');
    input.dataset.testid = 'inline-fill-input';
    input.dataset.blankIndex = String(blankIndex);
    input.value = values[blankIndex] || '';
    input.disabled = !!(state.session.exam.submitted || (!examPending && answerState.submitted));
    input.placeholder = t('feedback.blank_label', { index: blankIndex + 1 });
    input.addEventListener('input', () => updateFillInput(blankIndex, input.value));
    if (examPending) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitCurrentQuestion();
        }
      });
    }
  });
}

function hasInlineFillInputs() {
  return !!refs.questionText.querySelector('input.qb-blank, input[data-testid="inline-fill-input"]');
}

function renderQuestionImages(question) {
  refs.questionImages.innerHTML = '';
  getQuestionImages(question).forEach((src, index) => {
    const button = document.createElement('button');
    button.className = 'question-image';
    button.type = 'button';
    button.dataset.testid = 'question-image';
    button.dataset.imageIndex = String(index);
    button.innerHTML = `<img alt="${escapeAttribute(t('question.image_alt', { index: index + 1 }))}" src="${escapeAttribute(src)}">`;
    button.addEventListener('click', () => openLightbox(src));
    refs.questionImages.appendChild(button);
  });
}

function renderQuestionChoices(question, answerState, examPending) {
  refs.questionChoices.innerHTML = '';
  refs.questionChoices.hidden = !Array.isArray(question.choices);
  if (!Array.isArray(question.choices)) return;
  const selected = new Set(asArray(answerState.selected).map((value) => Number(value)));
  const correctAnswers = new Set(getCorrectAnswerIndices(question));
  const reveal = answerState.submitted || answerState.showAnswer || state.session.exam.submitted;
  const locked = !!(state.session.exam.submitted || (!examPending && answerState.submitted));

  question.choices.forEach((choice, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.dataset.testid = 'choice-button';
    button.dataset.choiceIndex = String(index);
    button.setAttribute('aria-pressed', selected.has(index) ? 'true' : 'false');
    button.classList.toggle('is-selected', selected.has(index));
    if (reveal && correctAnswers.has(index)) button.classList.add('is-correct');
    if (reveal && selected.has(index) && !correctAnswers.has(index)) button.classList.add('is-wrong');
    button.innerHTML = `
      <span class="choice-marker">${String.fromCharCode(65 + index)}</span>
      <span>${escapeHTML(choice)}</span>
    `;
    button.addEventListener('click', () => selectChoiceIndex(question, index));
    refs.questionChoices.appendChild(button);
  });

  refs.questionChoices.querySelectorAll('button').forEach((button) => {
    button.disabled = locked;
  });
}

function renderFillArea(question, answerState, examPending) {
  refs.fillArea.innerHTML = '';
  const blanks = Array.isArray(question.blanks) ? question.blanks : [];
  const hasInline = hasInlineFillInputs();
  refs.fillArea.hidden = !blanks.length || hasInline;
  if (!blanks.length || hasInline) return;
  const values = Array.isArray(answerState.fills) ? answerState.fills : [];
  blanks.forEach((_, index) => {
    const row = document.createElement('label');
    row.className = 'fill-row';
    row.innerHTML = `<span>${escapeHTML(t('feedback.blank_label', { index: index + 1 }))}</span>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.testid = 'fill-input';
    input.dataset.blankIndex = String(index);
    input.value = values[index] || '';
    input.disabled = !!(state.session.exam.submitted || (!examPending && answerState.submitted));
    input.placeholder = t('feedback.blank_label', { index: index + 1 });
    input.addEventListener('input', () => updateFillInput(index, input.value));
    if (examPending) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitCurrentQuestion();
        }
      });
    }
    row.appendChild(input);
    refs.fillArea.appendChild(row);
  });
}

function renderFeedback(question, answerState, examPending) {
  refs.feedbackPanel.hidden = true;
  refs.feedbackPanel.className = 'feedback-panel';
  refs.feedbackPanel.dataset.feedbackKind = 'hidden';
  if (examPending && !state.session.exam.submitted) return;
  if (!(answerState.submitted || answerState.showAnswer || state.session.exam.submitted)) return;

  let result;
  if (answerState.submitted || state.session.exam.submitted) {
    result = evaluateQuestion(question, answerState);
    refs.feedbackPanel.classList.add(result.isCorrect ? 'is-correct' : 'is-wrong');
    refs.feedbackPanel.dataset.feedbackKind = result.isCorrect ? 'correct' : 'wrong';
    refs.feedbackPanel.innerHTML = `<strong>${result.isCorrect ? t('feedback.correct_title') : t('feedback.wrong_title')}</strong><div>${escapeHTML(result.feedback)}</div>`;
  } else {
    refs.feedbackPanel.classList.add('is-wrong');
    refs.feedbackPanel.dataset.feedbackKind = 'reference';
    refs.feedbackPanel.innerHTML = `<strong>${t('feedback.reference_title')}</strong><div>${escapeHTML(buildCorrectAnswerText(question))}</div>`;
  }
  refs.feedbackPanel.hidden = false;
}

function renderExplanation(question) {
  if (!question.explanation) {
    refs.explanationPanel.hidden = true;
    refs.explanationPanel.textContent = '';
    return;
  }
  refs.explanationPanel.hidden = false;
  refs.explanationPanel.innerHTML = `<strong>${escapeHTML(t('explanation.label'))}</strong><div>${escapeHTML(question.explanation)}</div>`;
}

function renderExamSummary() {
  const examDone = state.session.exam.active && state.session.exam.submitted;
  refs.examSummary.hidden = !examDone;
  if (!examDone) {
    refs.examSummary.innerHTML = '';
    return;
  }
  const answered = state.session.ids.map((id) => [id, evaluateQuestion(state.questionMap.get(id), getAnswerState(id))]);
  const correct = answered.filter(([, result]) => result.isCorrect).length;
  const answeredCount = answered.filter(([, result]) => result.isAnswered).length;
  const wrongIds = answered.filter(([, result]) => result.isAnswered && !result.isCorrect).map(([id]) => id);
  refs.examSummary.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">${escapeHTML(t('summary.eyebrow'))}</p>
        <h2>${escapeHTML(t('summary.title'))}</h2>
      </div>
      <span class="pill">${formatDuration(Math.max(0, (state.session.exam.finishedAt || runtime.now()) - (state.session.exam.startedAt || runtime.now())))}</span>
    </div>
    <div class="summary-list">
      <div>${escapeHTML(t('summary.answered'))}：${answeredCount} / ${state.session.ids.length}</div>
      <div>${escapeHTML(t('summary.correct'))}：${correct}</div>
      <div>${escapeHTML(t('summary.accuracy'))}：${state.session.ids.length ? Math.round((correct / state.session.ids.length) * 100) : 0}%</div>
      <div>${escapeHTML(t('summary.wrong'))}：${wrongIds.length}</div>
    </div>
    <div class="question-actions">
      <button class="button button--ghost" type="button" id="retryWrongBtn" data-testid="retry-wrong-btn">${escapeHTML(t('summary.retry_wrong'))}</button>
      <button class="button button--ghost" type="button" id="backToPracticeBtn" data-testid="back-to-practice-btn">${escapeHTML(t('summary.back_practice'))}</button>
    </div>
  `;
  refs.examSummary.querySelector('#retryWrongBtn')?.addEventListener('click', () => activateMode('wrong'));
  refs.examSummary.querySelector('#backToPracticeBtn')?.addEventListener('click', () => activateMode('all'));
}

function selectChoiceIndex(question, index) {
  if (!question || state.session.exam.submitted) return;
  const id = String(question.id || '');
  const answerState = ensureAnswerState(id);
  const selected = new Set(asArray(answerState.selected).map((value) => Number(value)));
  if (isMultiQuestion(question)) {
    if (selected.has(index)) selected.delete(index);
    else selected.add(index);
  } else {
    selected.clear();
    selected.add(index);
  }
  answerState.selected = [...selected].sort((a, b) => a - b);
  answerState.showAnswer = false;
  saveSessionState();
  renderPlayer();
  if (state.prefs.autoSubmit && !(state.session.exam.active && !state.session.exam.submitted)) {
    submitCurrentQuestion();
  }
}

function updateFillInput(blankIndex, value) {
  const id = currentQuestionId();
  if (!id || state.session.exam.submitted) return;
  const answerState = ensureAnswerState(id);
  const fills = Array.isArray(answerState.fills) ? answerState.fills.slice() : [];
  fills[blankIndex] = value;
  answerState.fills = fills;
  answerState.showAnswer = false;
  saveSessionState();
  maybeAutoSubmitFill(id);
}

function maybeAutoSubmitFill(id) {
  if (!state.prefs.autoSubmit) return;
  if (state.session.exam.active && !state.session.exam.submitted) return;
  const question = state.questionMap.get(id);
  if (!question || getQuestionType(question) !== 'fill') return;
  const answerState = ensureAnswerState(id);
  if (answerState.submitted) return;
  const blanks = Array.isArray(question.blanks) ? question.blanks : [];
  const fills = Array.isArray(answerState.fills) ? answerState.fills : [];
  if (!blanks.length || fills.length < blanks.length || blanks.some((_, index) => !String(fills[index] || '').trim())) return;
  if (state.autoSubmitTimers.has(id)) window.clearTimeout(state.autoSubmitTimers.get(id));
  const timer = window.setTimeout(() => {
    state.autoSubmitTimers.delete(id);
    if (state.prefs.autoSubmit && !ensureAnswerState(id).submitted) submitCurrentQuestion();
  }, 350);
  state.autoSubmitTimers.set(id, timer);
}

function submitCurrentQuestion() {
  const id = currentQuestionId();
  if (!id) return;
  if (state.session.exam.submitted) return;
  const question = state.questionMap.get(id);
  const answerState = ensureAnswerState(id);
  const examPending = state.session.exam.active && !state.session.exam.submitted;

  if (examPending) {
    answerState.saved = true;
    saveSessionState();
    if (moveQuestion(1, { silentIfEdge: true })) return;
    renderPlayer();
    return;
  }

  const result = evaluateQuestion(question, answerState);
  if (!result.isAnswered) {
    showStatus(t('status.answer_required'), 'error');
    return;
  }
  answerState.submitted = true;
  answerState.isCorrect = result.isCorrect;
  answerState.showAnswer = false;
  bumpAttempt(id);
  state.wrong = recordPracticeResult(state.wrong, id, result.isCorrect);
  saveWrongSet();
  saveAttemptMap();
  saveSessionState();
  showStatus(result.isCorrect ? t('status.correct') : t('status.wrong'), result.isCorrect ? 'success' : 'error');
  renderPlayer();
}

function showCurrentAnswer() {
  const id = currentQuestionId();
  if (!id) return;
  const answerState = ensureAnswerState(id);
  answerState.showAnswer = true;
  saveSessionState();
  renderPlayer();
}

function redoCurrentQuestion() {
  const id = currentQuestionId();
  if (!id) return;
  if (state.session.exam.submitted) return;
  state.session.answers[id] = {
    selected: [],
    fills: [],
    submitted: false,
    isCorrect: false,
    showAnswer: false,
    saved: false,
  };
  saveSessionState();
  renderPlayer();
}

function finishExamSession() {
  if (!(state.session.exam.active && !state.session.exam.submitted)) return;
  state.session.ids.forEach((id) => {
    const question = state.questionMap.get(id);
    const answerState = ensureAnswerState(id);
    const result = evaluateQuestion(question, answerState);
    answerState.submitted = result.isAnswered;
    answerState.isCorrect = result.isCorrect;
    answerState.showAnswer = false;
    if (result.isAnswered) {
      bumpAttempt(id);
      state.wrong = recordPracticeResult(state.wrong, id, result.isCorrect);
    }
  });
  state.session.exam.submitted = true;
  state.session.exam.finishedAt = runtime.now();
  saveWrongSet();
  saveAttemptMap();
  saveSessionState();
  renderPlayer();
}

function moveQuestion(delta, { silentIfEdge = false } = {}) {
  const ids = state.session.ids;
  const idx = ids.indexOf(currentQuestionId());
  const nextIndex = idx + delta;
  if (nextIndex < 0 || nextIndex >= ids.length) {
    if (!silentIfEdge) renderPlayer();
    return false;
  }
  state.session.currentId = ids[nextIndex];
  saveSessionState();
  renderPlayer();
  return true;
}

function toggleCurrentQuestionStar() {
  const id = currentQuestionId();
  if (!id) return;
  if (state.starred.has(id)) state.starred.delete(id);
  else state.starred.add(id);
  saveStarredSet();
  renderPlayer();
}

function removeCurrentFromWrong() {
  const id = currentQuestionId();
  if (!id || !state.wrong.has(id)) return;
  state.wrong.delete(id);
  saveWrongSet();
  if (state.session.mode === 'wrong') {
    recomputeIdsForCurrentMode();
    return;
  }
  renderPlayer();
}

function toggleAutoSubmit() {
  state.prefs.autoSubmit = !state.prefs.autoSubmit;
  savePrefs();
  renderPlayer();
}

function toggleFocusMode() {
  if (refs.playerView.hidden) return;
  state.prefs.focusMode = !state.prefs.focusMode;
  savePrefs();
  applyFocusMode();
}

function applyFocusMode() {
  document.body.classList.toggle('focus-mode', !!state.prefs.focusMode && !refs.playerView.hidden);
  const label = state.prefs.focusMode ? t('controls.focus_off') : t('controls.focus_on');
  refs.focusModeBtn.textContent = label;
  refs.globalFocusBtn.textContent = label;
  refs.globalFocusBtn.disabled = refs.playerView.hidden;
}

function syncFilterControls() {
  refs.questionSearch.value = state.session.filters.search || '';
  refs.filterImagesOnly.checked = !!state.session.filters.imagesOnly;
  refs.filterUnanswered.checked = !!state.session.filters.unansweredOnly;
  refs.typeFilter.value = state.session.filters.type || 'all';
  refs.tagFilter.value = optionOrDefault(refs.tagFilter, state.session.filters.tag);
  refs.sectionFilter.value = optionOrDefault(refs.sectionFilter, state.session.filters.section);
  refs.examCountSelect.value = optionOrDefault(refs.examCountSelect, String(state.session.exam.questionCount || 20));

  const disableFilters = state.session.exam.active && !state.session.exam.submitted;
  [refs.questionSearch, refs.filterImagesOnly, refs.filterUnanswered, refs.typeFilter, refs.tagFilter, refs.sectionFilter].forEach((node) => {
    node.disabled = disableFilters;
  });
}

function optionOrDefault(select, value) {
  const fallback = Array.from(select.options)[0] ? Array.from(select.options)[0].value : '';
  return Array.from(select.options).some((option) => option.value === value) ? value : fallback;
}

function renderQuestionTextFromHtml(html) {
  return sanitizeQuestionHtml(String(html || ''));
}

function handleKeyboardShortcuts(event) {
  if (!refs.imageLightbox.hidden) {
    if (event.key === 'Escape') {
      closeLightbox();
    }
    return;
  }
  if (!refs.passwordModal.hidden) return;
  if (refs.playerView.hidden) return;
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = String(event.target && event.target.tagName || '').toLowerCase();
  const isTextInput = tag === 'input' || tag === 'textarea' || tag === 'select' || !!(event.target && event.target.isContentEditable);
  if (isTextInput) return;

  if (/^[1-9]$/.test(event.key)) {
    const question = currentQuestion();
    if (question && Array.isArray(question.choices)) {
      selectChoiceIndex(question, Number(event.key) - 1);
    }
  } else if (event.key === 'Enter' && !isTextInput) {
    event.preventDefault();
    submitCurrentQuestion();
  } else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'j') {
    event.preventDefault();
    moveQuestion(1, { silentIfEdge: true });
  } else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'k') {
    event.preventDefault();
    moveQuestion(-1, { silentIfEdge: true });
  } else if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    toggleCurrentQuestionStar();
  } else if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    refs.questionSearch.focus();
    refs.questionSearch.select();
  } else if (event.key.toLowerCase() === 'g') {
    event.preventDefault();
    document.querySelector('.question-map-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function evaluateQuestion(question, answerState) {
  if (!question) {
    return { isAnswered: false, isCorrect: false, feedback: t('misc.unknown') };
  }

  if (Array.isArray(question.blanks)) {
    const blanks = question.blanks;
    const fills = Array.isArray(answerState.fills) ? answerState.fills : [];
    const fillResult = evaluateFillAnswer(question, fills);
    const feedback = fillResult.isCorrect
      ? t('feedback.fill_correct')
      : t('feedback.correct_answers', {
          value: buildFillAnswerText(question, blanks),
        });
    return { isAnswered: fillResult.isAnswered, isCorrect: fillResult.isCorrect, feedback };
  }

  const selected = Array.from(new Set(asArray(answerState.selected).map((value) => Number(value)).filter(Number.isInteger))).sort((a, b) => a - b);
  const correct = getCorrectAnswerIndices(question);
  const isAnswered = selected.length > 0;
  const isCorrect = selected.length === correct.length && selected.every((value, index) => value === correct[index]);
  return {
    isAnswered,
    isCorrect,
    feedback: isCorrect ? t('feedback.answer_matches') : t('feedback.correct_answers', { value: buildCorrectAnswerText(question) }),
  };
}

function buildCorrectAnswerText(question) {
  if (Array.isArray(question.blanks)) {
    return buildFillAnswerText(question, question.blanks);
  }
  return getCorrectAnswerIndices(question)
    .map((index) => `${String.fromCharCode(65 + index)}. ${String(asArray(question.choices)[index] || '')}`)
    .join('；');
}

function buildFillAnswerText(question, blanks) {
  if (Array.isArray(question.answer_sets) && question.answer_sets.length) {
    return question.answer_sets.map((set, setIndex) => {
      const parts = asArray(set).map((accepted, index) => {
        const values = asArray(accepted).length ? asArray(accepted) : [accepted];
        return `${t('feedback.blank_label', { index: index + 1 })} ${values.filter(Boolean).join(' / ') || t('feedback.empty')}`;
      });
      return `Set ${setIndex + 1}: ${parts.join('；')}`;
    }).join(' | ');
  }
  return asArray(blanks).map((accepted, index) => `${t('feedback.blank_label', { index: index + 1 })} ${asArray(accepted).join(' / ') || t('feedback.empty')}`).join('；');
}

function getCorrectAnswerIndices(question) {
  if (Array.isArray(question.answers)) {
    return question.answers.map((value) => Number(value)).filter(Number.isInteger).sort((a, b) => a - b);
  }
  if (Number.isInteger(question.answer)) return [Number(question.answer)];
  return [];
}

function getQuestionType(question) {
  return detectQuestionType(question);
}

function isMultiQuestion(question) {
  return detectMultiQuestion(question);
}

function typeLabel(type, isMulti = false) {
  if (type === 'fill') return t('type.fill');
  if (type === 'multi' || isMulti) return t('type.multi');
  return t('type.single');
}

function getQuestionImages(question) {
  return getQuestionImageList(question);
}

function buildSearchBlob(question) {
  return buildQuestionSearchBlob(question);
}

function stripHtml(html) {
  return stripQuestionHtml(html);
}

function sanitizeQuestionHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  template.content.querySelectorAll('script,style').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    });
  });
  return template.innerHTML;
}

function openLightbox(src) {
  refs.lightboxImage.src = src;
  refs.imageLightbox.hidden = false;
}

function closeLightbox() {
  refs.imageLightbox.hidden = true;
  refs.lightboxImage.removeAttribute('src');
}

function showStatus(text, kind = '') {
  if (!text) {
    refs.bankStatus.hidden = true;
    refs.bankStatus.textContent = '';
    refs.bankStatus.className = 'status-banner';
    refs.bankStatus.dataset.kind = 'neutral';
    return;
  }
  refs.bankStatus.hidden = false;
  refs.bankStatus.className = `status-banner ${kind === 'error' ? 'is-error' : kind === 'success' ? 'is-success' : ''}`.trim();
  refs.bankStatus.dataset.kind = kind || 'neutral';
  refs.bankStatus.textContent = text;
}

function currentBankId() {
  return state.currentEntry ? String(state.currentEntry.id || '') : '';
}

function currentQuestionId() {
  return String(state.session.currentId || '');
}

function currentQuestion() {
  return state.questionMap.get(currentQuestionId()) || null;
}

function getAnswerState(id) {
  return state.session.answers[String(id || '')] || null;
}

function ensureAnswerState(id) {
  const key = String(id || '');
  if (!state.session.answers[key]) {
    state.session.answers[key] = {
      selected: [],
      fills: [],
      submitted: false,
      isCorrect: false,
      showAnswer: false,
      saved: false,
    };
  }
  return state.session.answers[key];
}

function isQuestionTouched(id) {
  const answerState = getAnswerState(id);
  if (!answerState) return false;
  return !!(
    asArray(answerState.selected).length ||
    asArray(answerState.fills).some((value) => String(value || '').trim()) ||
    answerState.submitted ||
    answerState.saved
  );
}

function saveSessionState() {
  const bankId = currentBankId();
  if (!bankId) return;
  saveJSON(sessionKey(bankId, 'session'), state.session);
}

function saveStarredSet() {
  const bankId = currentBankId();
  if (!bankId) return;
  saveJSON(sessionKey(bankId, 'starred'), [...state.starred]);
}

function saveWrongSet() {
  const bankId = currentBankId();
  if (!bankId) return;
  saveJSON(sessionKey(bankId, 'wrong'), [...state.wrong]);
}

function saveAttemptMap() {
  const bankId = currentBankId();
  if (!bankId) return;
  saveJSON(sessionKey(bankId, 'attempts'), state.attempts);
}

function savePrefs() {
  const bankId = currentBankId();
  if (!bankId) return;
  saveJSON(sessionKey(bankId, 'prefs'), state.prefs);
}

function persistAllPlayerState() {
  saveSessionState();
  saveStarredSet();
  saveWrongSet();
  saveAttemptMap();
  savePrefs();
}

function bumpAttempt(id) {
  const key = String(id || '');
  state.attempts[key] = Math.max(0, Number(state.attempts[key] || 0)) + 1;
}

function sessionKey(bankId, suffix) {
  return `qb:${bankId}:v1:${suffix}`;
}

function getSessionPassword(bankId) {
  return sessionStorage.getItem(`qb:${bankId}:session-pass`) || '';
}

function saveSessionPassword(bankId, password) {
  sessionStorage.setItem(`qb:${bankId}:session-pass`, String(password || ''));
}

function clearSessionPassword(bankId) {
  sessionStorage.removeItem(`qb:${bankId}:session-pass`);
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Ignore storage quota issues for this lightweight client-side app.
  }
}

async function fetchJSON(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(t('error.load_bank', { status: response.status }));
  return response.json();
}

function modeLabel(mode) {
  return ({
    all: t('mode.all'),
    wrong: t('mode.wrong'),
    starred: t('mode.starred'),
    random: t('mode.random'),
    random150: t('mode.random150'),
    exam: t('mode.exam'),
  })[mode] || t('mode.all');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function shuffle(list) {
  return shuffleWithRng(list, runtime.rng);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) return t('misc.unknown');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('misc.unknown');
  const locale = state.locale === 'zh' ? 'zh-CN' : state.locale === 'es' ? 'es-ES' : 'en-US';
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function eqLoose(left, right) {
  const normalize = (value) => String(value ?? '').replace(/\u00a0/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
  const collapse = (value) => normalize(value).replace(/\s+/g, '');
  return normalize(left) === normalize(right) || collapse(left) === collapse(right);
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHTML(value).replace(/`/g, '&#96;');
}
