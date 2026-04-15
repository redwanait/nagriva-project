// ═══════════════════════════════════════════════════
// ⚙️ SUPABASE CONFIGURATION
// 1. Go to https://supabase.com → create a project
// 2. Project Settings → API → copy "Project URL" and "anon public" key
// 3. Paste them below, then run the SQL schema (see bottom of file)
// ═══════════════════════════════════════════════════
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';       // e.g. https://xyzabc.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';  // starts with "eyJ..."

// ═══════════════════════════════════════════════════
// SUPABASE INIT (graceful – runs in demo mode if unconfigured)
// ═══════════════════════════════════════════════════
const DEMO_MODE = SUPABASE_URL === 'YOUR_SUPABASE_URL';
let _sb = null;
if (!DEMO_MODE && typeof supabase !== 'undefined') {
  try {
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase connected');
  } catch(e) { console.warn('Supabase init error:', e.message); }
} else {
  console.info('ℹ️ Running in demo mode. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable real backend.');
}

// ═══════════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════════
let currentUser       = null;   // Supabase auth user object
let userProfile       = null;   // row from users table
let savedIds          = new Set(JSON.parse(localStorage.getItem('nagriva-saved') || '[]'));
let chatThreadId      = null;
let _chatChannel      = null;   // Supabase Realtime channel for chat
let _notifChannel     = null;   // Supabase Realtime channel for notifications
let myServicesCache   = [];
let ALL_SERVICES      = [];     // combined static + Supabase services (used for lookups)

// ═══════════════════════════════════════════════════
// NORMALIZE: convert Supabase row → renderCard-compatible object
// ═══════════════════════════════════════════════════
function normalizeService(row) {
  // If already in legacy format (has sellerImg property), return as-is
  if ('sellerImg' in row) return row;
  const catColors = { video: '#dc2626', design: '#d97706', writing: '#059669' };
  const catBadges = { video: 'badge-red', design: 'badge-amber', writing: 'badge-green' };
  const catLabels = { video: '🎬 فيديو', design: '🎨 تصميم', writing: '✍️ كتابة' };
  return {
    id:           row.id,
    cat:          row.cat,
    sub:          row.sub || row.cat,
    title:        row.title,
    desc:         row.description || row.desc || '',
    seller:       row.seller_name || 'بائع',
    sellerLv:     row.seller_level || '⭐ بائع',
    sellerInitial:row.seller_initial || (row.seller_name?.[0] || 'م'),
    sellerImg:    row.seller_img || '',
    sellerId:     row.seller_id || '',
    price:        row.price,
    priceStd:     row.price_std  || row.priceStd  || Math.round(row.price * 1.7),
    pricePro:     row.price_pro  || row.pricePro  || Math.round(row.price * 3.1),
    rating:       row.rating || 0,
    reviews:      row.reviews || 0,
    badge:        row.badge || '',
    badgeTxt:     row.badge_txt || '',
    img:          row.img || 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&q=70',
    catColor:     catColors[row.cat] || '#6d28d9',
    catBadge:     catBadges[row.cat] || '',
    catBadgeTxt:  catLabels[row.cat] || row.cat,
    tags:         Array.isArray(row.tags) ? row.tags : [],
    delivery:     row.delivery || '3 أيام',
    featured:     row.featured || false,
  };
}

// ═══════════════════════════════════════════════════
// STATIC SERVICES (demo fallback – shown when Supabase is not configured)
// ═══════════════════════════════════════════════════
const SERVICES = [
  { id: 1,  cat: 'video',   sub: 'reels',      title: 'سأصنع لك ريلز احترافياً يضاعف مشاهداتك',                seller: 'أمين بوزيد',         sellerLv: '⭐ بائع مميز',  sellerInitial: 'أ', sellerImg: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&q=75&fit=crop&crop=faces', price: 45,  priceStd: 75,  pricePro: 140, rating: 4.9, reviews: 203, badge: 'badge-hot',  badgeTxt: 'HOT 🔥',  img: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&q=70',     catColor: '#dc2626', catBadge: 'badge-red',   catBadgeTxt: '🎬 فيديو',  tags: ['ريلز','سوشيال','تحريك'],          delivery: '24 ساعة', featured: true  },
  { id: 2,  cat: 'video',   sub: 'youtube',    title: 'مونتاج فيديو يوتيوب شورتس تعليمي بجودة عالية',          seller: 'كريم التميمي',       sellerLv: '🏆 Top Seller', sellerInitial: 'ك', sellerImg: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&q=75&fit=crop&crop=faces', price: 60,  priceStd: 100, pricePro: 180, rating: 5.0, reviews: 142, badge: 'badge-top',  badgeTxt: 'TOP ⭐',   img: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=70',     catColor: '#dc2626', catBadge: 'badge-red',   catBadgeTxt: '🎬 فيديو',  tags: ['يوتيوب','شورتس','تعليم'],         delivery: '48 ساعة', featured: true  },
  { id: 3,  cat: 'video',   sub: 'motion',     title: 'موشن جرافيك احترافي للإعلانات والعروض التقديمية',        seller: 'سلمى الإدريسي',      sellerLv: '⭐ بائع مميز',  sellerInitial: 'س', sellerImg: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&q=75&fit=crop&crop=faces', price: 120, priceStd: 200, pricePro: 350, rating: 4.8, reviews: 87,  badge: 'badge-new',  badgeTxt: 'NEW ✨',   img: 'https://images.unsplash.com/photo-1536240478700-b869ad10e2ab?w=400&q=70',     catColor: '#dc2626', catBadge: 'badge-red',   catBadgeTxt: '🎬 فيديو',  tags: ['موشن','after effects','إعلان'],   delivery: '3 أيام'  },
  { id: 4,  cat: 'video',   sub: 'logo-anim',  title: 'تحريك شعارك (Logo Animation) بأسلوب ثريد',              seller: 'عمر بلعيد',          sellerLv: '🌟 جديد ومميز', sellerInitial: 'ع', sellerImg: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&q=75&fit=crop&crop=faces', price: 35,  priceStd: 65,  pricePro: 120, rating: 4.7, reviews: 52,  badge: '',           badgeTxt: '',        img: 'https://images.unsplash.com/photo-1487017159836-4e23ece2e4cf?w=400&q=70',     catColor: '#dc2626', catBadge: 'badge-red',   catBadgeTxt: '🎬 فيديو',  tags: ['لوجو','animate','ثريد'],          delivery: '24 ساعة' },
  { id: 5,  cat: 'video',   sub: 'ads',        title: 'مونتاج إعلان تطبيق موبايل احترافي 30 ثانية',            seller: 'رنا الغامدي',        sellerLv: '🏆 Top Seller', sellerInitial: 'ر', sellerImg: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&q=75&fit=crop&crop=faces', price: 85,  priceStd: 150, pricePro: 280, rating: 4.9, reviews: 96,  badge: 'badge-top',  badgeTxt: 'TOP ⭐',   img: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=400&q=70',         catColor: '#dc2626', catBadge: 'badge-red',   catBadgeTxt: '🎬 فيديو',  tags: ['إعلان','تطبيق','30 ثانية'],       delivery: '3 أيام'  },
  { id: 6,  cat: 'design',  sub: 'logo',       title: 'تصميم شعار احترافي بـ 3 مقترحات وملف مفتوح',            seller: 'أحمد الخميسي',       sellerLv: '🏆 Top Seller', sellerInitial: 'أ', sellerImg: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=80&q=75&fit=crop&crop=faces', price: 80,  priceStd: 160, pricePro: 300, rating: 5.0, reviews: 310, badge: 'badge-top',  badgeTxt: 'TOP ⭐',   img: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&q=70',         catColor: '#d97706', catBadge: 'badge-amber', catBadgeTxt: '🎨 تصميم', tags: ['لوجو','شعار','AI vector'],         delivery: '48 ساعة', featured: true  },
  { id: 7,  cat: 'design',  sub: 'identity',   title: 'هوية بصرية كاملة: شعار + دليل هوية + بطاقة أعمال',      seller: 'هلا المنصوري',       sellerLv: '⭐ بائع مميز',  sellerInitial: 'ه', sellerImg: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&q=75&fit=crop&crop=faces', price: 250, priceStd: 420, pricePro: 700, rating: 4.9, reviews: 178, badge: 'badge-hot',  badgeTxt: 'HOT 🔥',  img: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400&q=70',     catColor: '#d97706', catBadge: 'badge-amber', catBadgeTxt: '🎨 تصميم', tags: ['هوية','بطاقة','brand guide'],       delivery: '7 أيام'  },
  { id: 8,  cat: 'design',  sub: 'social',     title: 'تصميم 30 بوست سوشيال ميديا بهوية موحدة',                seller: 'طارق بن صالح',       sellerLv: '⭐ بائع مميز',  sellerInitial: 'ط', sellerImg: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&q=75&fit=crop&crop=faces', price: 120, priceStd: 200, pricePro: 350, rating: 4.8, reviews: 95,  badge: 'badge-new',  badgeTxt: 'NEW ✨',   img: 'https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=400&q=70',     catColor: '#d97706', catBadge: 'badge-amber', catBadgeTxt: '🎨 تصميم', tags: ['انستغرام','سوشيال','30 بوست'],     delivery: '5 أيام'  },
  { id: 9,  cat: 'design',  sub: 'logo',       title: 'تصميم لوجو مع ثلاثة ألوان وتعديلات غير محدودة',         seller: 'دانا الزهراني',      sellerLv: '🌟 جديد ومميز', sellerInitial: 'د', sellerImg: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=80&q=75&fit=crop&crop=faces', price: 60,  priceStd: 110, pricePro: 200, rating: 4.7, reviews: 43,  badge: '',           badgeTxt: '',        img: 'https://images.unsplash.com/photo-1572044162444-ad60f128bdea?w=400&q=70',     catColor: '#d97706', catBadge: 'badge-amber', catBadgeTxt: '🎨 تصميم', tags: ['لوجو','ألوان','تعديلات'],          delivery: '3 أيام'  },
  { id: 10, cat: 'design',  sub: 'print',      title: 'تصميم بنر وفلاير احترافي للمتاجر والمشاريع',            seller: 'يوسف الشهري',        sellerLv: '⭐ بائع مميز',  sellerInitial: 'ي', sellerImg: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=80&q=75&fit=crop&crop=faces', price: 40,  priceStd: 80,  pricePro: 150, rating: 4.9, reviews: 127, badge: 'badge-hot',  badgeTxt: 'HOT 🔥',  img: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=400&q=70',         catColor: '#d97706', catBadge: 'badge-amber', catBadgeTxt: '🎨 تصميم', tags: ['بنر','فلاير','طباعة'],             delivery: '24 ساعة', featured: true  },
  { id: 11, cat: 'writing', sub: 'articles',   title: '10 مقالات SEO احترافية لتصدّر جوجل',                    seller: 'ليلى بوعزيزي',       sellerLv: '🏆 Top Seller', sellerInitial: 'ل', sellerImg: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=80&q=75&fit=crop&crop=faces', price: 80,  priceStd: 140, pricePro: 250, rating: 4.9, reviews: 214, badge: 'badge-hot',  badgeTxt: 'HOT 🔥',  img: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400&q=70',     catColor: '#059669', catBadge: 'badge-green', catBadgeTxt: '✍️ كتابة', tags: ['SEO','مقالات','جوجل'],             delivery: '7 أيام',  featured: true  },
  { id: 12, cat: 'writing', sub: 'products',   title: 'وصف 50 منتجاً لمتجرك الإلكتروني بأسلوب تسويقي',        seller: 'عبدالرحمن السليمان', sellerLv: '⭐ بائع مميز',  sellerInitial: 'ع', sellerImg: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=80&q=75&fit=crop&crop=faces', price: 60,  priceStd: 110, pricePro: 200, rating: 4.8, reviews: 156, badge: 'badge-top',  badgeTxt: 'TOP ⭐',   img: 'https://images.unsplash.com/photo-1586880244386-8b3e34c8382c?w=400&q=70',     catColor: '#059669', catBadge: 'badge-green', catBadgeTxt: '✍️ كتابة', tags: ['منتجات','تسويق','متجر'],           delivery: '5 أيام'  },
  { id: 13, cat: 'writing', sub: 'landing',    title: 'صفحة هبوط تسويقية كاملة تحوّل الزوار لعملاء',          seller: 'مروى بنت فهد',       sellerLv: '⭐ بائع مميز',  sellerInitial: 'م', sellerImg: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&q=75&fit=crop&crop=faces', price: 120, priceStd: 200, pricePro: 350, rating: 5.0, reviews: 89,  badge: 'badge-new',  badgeTxt: 'NEW ✨',   img: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=70',     catColor: '#059669', catBadge: 'badge-green', catBadgeTxt: '✍️ كتابة', tags: ['landing page','تحويل','تسويق'],   delivery: '3 أيام'  },
  { id: 14, cat: 'writing', sub: 'social-copy',title: '60 كابشن سوشيال ميديا شهرياً بأسلوبك الخاص',           seller: 'فيصل الدوسري',       sellerLv: '🌟 جديد ومميز', sellerInitial: 'ف', sellerImg: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=80&q=75&fit=crop&crop=faces', price: 45,  priceStd: 80,  pricePro: 140, rating: 4.7, reviews: 67,  badge: '',           badgeTxt: '',        img: 'https://images.unsplash.com/photo-1611926653458-09294b3142bf?w=400&q=70',     catColor: '#059669', catBadge: 'badge-green', catBadgeTxt: '✍️ كتابة', tags: ['كابشن','انستغرام','شهري'],         delivery: '7 أيام'  },
  { id: 15, cat: 'video',   sub: 'reels',      title: 'مونتاج ريلز تيك توك احترافي بمؤثرات بصرية وصوتية',     seller: 'نور الحسيني',        sellerLv: '⭐ بائع مميز',  sellerInitial: 'ن', sellerImg: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&q=75&fit=crop&crop=faces', price: 55,  priceStd: 90,  pricePro: 160, rating: 4.8, reviews: 74,  badge: '',           badgeTxt: '',        img: 'https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?w=400&q=70',     catColor: '#dc2626', catBadge: 'badge-red',   catBadgeTxt: '🎬 فيديو',  tags: ['تيك توك','ريلز','مؤثرات'],        delivery: '24 ساعة' },
  { id: 16, cat: 'video',   sub: 'youtube',    title: 'مونتاج بودكاست يوتيوب مع مقدمة وخاتمة متحركة',        seller: 'سامر البكري',        sellerLv: '⭐ بائع مميز',  sellerInitial: 'س', sellerImg: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=80&q=75&fit=crop&crop=faces', price: 75,  priceStd: 130, pricePro: 220, rating: 4.8, reviews: 61,  badge: '',           badgeTxt: '',        img: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=400&q=70',     catColor: '#dc2626', catBadge: 'badge-red',   catBadgeTxt: '🎬 فيديو',  tags: ['بودكاست','يوتيوب','مقدمة'],       delivery: '3 أيام'  },
  { id: 17, cat: 'design',  sub: 'identity',   title: 'تصميم منيو مطعم أو كافيه بهوية بصرية راقية',           seller: 'إيمان الحربي',       sellerLv: '🌟 جديد ومميز', sellerInitial: 'إ', sellerImg: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=80&q=75&fit=crop&crop=faces', price: 70,  priceStd: 130, pricePro: 220, rating: 4.9, reviews: 38,  badge: 'badge-new',  badgeTxt: 'NEW ✨',   img: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=70',         catColor: '#d97706', catBadge: 'badge-amber', catBadgeTxt: '🎨 تصميم', tags: ['منيو','مطعم','هوية'],              delivery: '3 أيام'  },
  { id: 18, cat: 'writing', sub: 'articles',   title: '5 مقالات SEO متخصصة في المجال التقني والبرمجة',        seller: 'ريم الشمري',         sellerLv: '⭐ بائع مميز',  sellerInitial: 'ر', sellerImg: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=80&q=75&fit=crop&crop=faces', price: 90,  priceStd: 160, pricePro: 280, rating: 5.0, reviews: 52,  badge: 'badge-top',  badgeTxt: 'TOP ⭐',   img: 'https://images.unsplash.com/photo-1471107340929-a87cd0f5b5f3?w=400&q=70',     catColor: '#059669', catBadge: 'badge-green', catBadgeTxt: '✍️ كتابة', tags: ['SEO','تقنية','برمجة'],             delivery: '5 أيام',  featured: true  },
];

// Seed lookup cache with static services
ALL_SERVICES = [...SERVICES];

// ═══════════════════════════════════════════════════
// AUTH STATE LISTENER
// ═══════════════════════════════════════════════════
if (_sb) {
  _sb.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    if (currentUser) {
      userProfile = await loadUserProfile(currentUser.id);
      updateNavForUser(currentUser);
      loadUserSavedServices();
      subscribeNotifications();
    } else {
      userProfile = null;
      updateNavForGuest();
      if (_notifChannel) { _sb.removeChannel(_notifChannel); _notifChannel = null; }
    }
  });
}

// ═══════════════════════════════════════════════════
// USER PROFILE (Firestore)
// ═══════════════════════════════════════════════════
async function loadUserProfile(uid) {
  if (!_sb) return null;
  try {
    const { data } = await _sb.from('users').select('*').eq('id', uid).single();
    return data || null;
  } catch(e) { return null; }
}

async function saveProfileSettings() {
  if (!currentUser) { showPage('auth'); return; }
  const name = document.getElementById('settingsName').value.trim();
  const role = document.getElementById('settingsRole').value;
  const bio  = document.getElementById('settingsBio').value.trim();
  if (!name) { showToast('⚠️ الرجاء إدخال الاسم'); return; }
  if (_sb) {
    try {
      const { error } = await _sb.from('users').upsert({ id: currentUser.id, name, role, bio, email: currentUser.email });
      if (error) throw error;
      userProfile = { ...userProfile, name, role, bio };
      updateNavForUser(currentUser);
      showToast('✅ تم حفظ التغييرات بنجاح');
    } catch(e) { showToast('❌ خطأ: ' + e.message); }
  } else {
    const prof = { name, role, bio, email: currentUser?.email || '' };
    localStorage.setItem('nagriva-profile', JSON.stringify(prof));
    userProfile = prof;
    showToast('✅ تم حفظ التغييرات (demo mode)');
  }
}

// ═══════════════════════════════════════════════════
// NAV STATE
// ═══════════════════════════════════════════════════
function updateNavForUser(user) {
  const displayName = userProfile?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'المستخدم';
  const initial     = displayName[0] || 'م';
  const photoURL    = userProfile?.avatar_url || user.user_metadata?.avatar_url || null;
  // Nav
  document.getElementById('navLoginBtn').style.display = 'none';
  document.getElementById('navUserWrap').style.display = '';
  document.getElementById('navUserName').textContent = displayName;
  const av = document.getElementById('navUserAv');
  if (photoURL) { av.innerHTML = `<img src="${photoURL}" alt="${displayName}">`; }
  else { av.textContent = initial; }
  // Drawer
  document.getElementById('drawerGuestLinks').style.display = 'none';
  document.getElementById('drawerUserLinks').style.display = '';
  const drawAv = document.querySelector('.drawer-av');
  if (drawAv) { drawAv.textContent = initial; }
  const drawName = document.querySelector('.drawer-user-name');
  if (drawName) drawName.textContent = displayName;
  const drawSub = document.querySelector('.drawer-user-sub');
  if (drawSub) drawSub.textContent = userProfile?.role === 'seller' ? '💼 بائع' : userProfile?.role === 'both' ? '🔄 بائع وعميل' : '🛒 عميل';
}

function updateNavForGuest() {
  document.getElementById('navLoginBtn').style.display = '';
  document.getElementById('navUserWrap').style.display = 'none';
  document.getElementById('drawerGuestLinks').style.display = '';
  document.getElementById('drawerUserLinks').style.display = 'none';
}

function toggleUserDD() {
  document.getElementById('userDropdown').classList.toggle('open');
}
function closeUserDD() {
  document.getElementById('userDropdown').classList.remove('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#navUserWrap')) closeUserDD();
});

// ═══════════════════════════════════════════════════
// AUTH: EMAIL LOGIN
// ═══════════════════════════════════════════════════
async function doEmailLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');
  errEl.classList.remove('show');
  if (!email || !pass) { errEl.textContent = 'الرجاء إدخال البريد الإلكتروني وكلمة المرور'; errEl.classList.add('show'); return; }

  if (!_sb) {
    // Demo mode: simulate login
    currentUser = { id: 'demo-' + email, email, user_metadata: { full_name: email.split('@')[0] } };
    userProfile = JSON.parse(localStorage.getItem('nagriva-profile') || '{}');
    userProfile.name = userProfile.name || email.split('@')[0];
    updateNavForUser(currentUser);
    showToast('✅ تم تسجيل الدخول (demo mode)');
    showPage('home');
    return;
  }
  btn.classList.add('btn-auth-loading'); btn.disabled = true;
  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    showToast('✅ مرحباً بعودتك!');
    showPage('home');
  } catch(e) {
    const msgs = {
      'Invalid login credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      'Email not confirmed': 'لم يتم تأكيد البريد الإلكتروني بعد — تحقق من بريدك',
      'Too many requests': 'محاولات كثيرة — حاول لاحقاً'
    };
    errEl.textContent = msgs[e.message] || e.message;
    errEl.classList.add('show');
  } finally { btn.classList.remove('btn-auth-loading'); btn.disabled = false; }
}

// ═══════════════════════════════════════════════════
// AUTH: EMAIL REGISTER
// ═══════════════════════════════════════════════════
async function doEmailRegister() {
  const first = document.getElementById('regFirstName').value.trim();
  const last  = document.getElementById('regLastName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPassword').value;
  const role  = document.getElementById('regRole').value;
  const errEl = document.getElementById('registerError');
  const btn   = document.getElementById('registerBtn');
  errEl.classList.remove('show');
  if (!first || !email || !pass) { errEl.textContent = 'الرجاء إكمال جميع الحقول المطلوبة'; errEl.classList.add('show'); return; }
  if (pass.length < 8) { errEl.textContent = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'; errEl.classList.add('show'); return; }

  if (!_sb) {
    // Demo mode
    const name = `${first} ${last}`.trim();
    currentUser = { id: 'demo-' + email, email, user_metadata: { full_name: name } };
    userProfile = { name, role, email };
    localStorage.setItem('nagriva-profile', JSON.stringify(userProfile));
    updateNavForUser(currentUser);
    showToast(`🎉 مرحباً ${first}! تم إنشاء حسابك (demo mode)`);
    showPage('home');
    return;
  }
  btn.classList.add('btn-auth-loading'); btn.disabled = true;
  try {
    const name = `${first} ${last}`.trim();
    const { data, error } = await _sb.auth.signUp({
      email, password: pass,
      options: { data: { full_name: name } }
    });
    if (error) throw error;
    // Upsert profile row (runs even before email confirmation)
    if (data.user) {
      await _sb.from('users').upsert({ id: data.user.id, name, email, role, created_at: new Date().toISOString() });
    }
    showToast(`🎉 مرحباً ${first}! تحقق من بريدك لتأكيد الحساب ثم سجّل دخولك`);
    switchAuth('login');
  } catch(e) {
    const msgs = {
      'User already registered': 'هذا البريد مسجل بالفعل',
      'Password should be at least 6 characters': 'كلمة المرور ضعيفة جداً'
    };
    errEl.textContent = msgs[e.message] || e.message;
    errEl.classList.add('show');
  } finally { btn.classList.remove('btn-auth-loading'); btn.disabled = false; }
}

// ═══════════════════════════════════════════════════
// AUTH: GOOGLE LOGIN
// ═══════════════════════════════════════════════════
async function doGoogleLogin() {
  if (!_sb) { showToast('🔗 تسجيل الدخول بـ Google يحتاج تفعيل Supabase'); return; }
  try {
    const { error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) throw error;
    // onAuthStateChange handles the rest after redirect
  } catch(e) { showToast('❌ ' + e.message); }
}

// ═══════════════════════════════════════════════════
// AUTH: LOGOUT
// ═══════════════════════════════════════════════════
async function doLogout() {
  if (_sb) { await _sb.auth.signOut(); }
  else { currentUser = null; userProfile = null; updateNavForGuest(); }
  savedIds = new Set();
  showToast('👋 تم تسجيل الخروج بنجاح');
  showPage('home');
}

// ═══════════════════════════════════════════════════
// AUTH: FORGOT PASSWORD
// ═══════════════════════════════════════════════════
async function doForgotPassword() {
  if (!_sb) { showToast('🔑 ميزة إعادة كلمة المرور تحتاج تفعيل Supabase'); return; }
  const email = document.getElementById('loginEmail')?.value?.trim() || prompt('أدخل بريدك الإلكتروني:');
  if (!email) return;
  try {
    const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    if (error) throw error;
    showToast('📧 تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك');
  } catch(e) { showToast('❌ ' + e.message); }
}

// ═══════════════════════════════════════════════════
// SERVICES: RENDER & POPULATE
// ═══════════════════════════════════════════════════
function renderCard(s) {
  const isSaved = savedIds.has(String(s.id));
  const sid     = String(s.id);
  const ratingVal = typeof s.rating === 'number' ? s.rating.toFixed(1) : (s.rating || '—');
  const safeTitle = (s.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  return `
  <div class="svc-card" onclick="viewService('${sid}')">
<div class="svc-card-thumb">
  <img src="${s.img}" alt="${escHtml(s.title)}" loading="lazy">
  <div class="t-overlay"></div>
  <span class="cat-chip badge ${s.catBadge}">${s.catBadgeTxt}</span>
  <button class="save-btn${isSaved?' saved':''}" onclick="event.stopPropagation();toggleSave('${sid}',this)" title="${isSaved?'إزالة من المحفوظات':'حفظ الخدمة'}">
    <i class="fa-${isSaved?'solid':'regular'} fa-heart"></i>
  </button>
  ${s.badgeTxt ? `<span class="hot-badge badge ${s.badge}">${s.badgeTxt}</span>` : ''}
</div>
<div class="svc-body">
  <div class="seller-row">
    <div class="seller-av"><img src="${s.sellerImg}" alt="${escHtml(s.seller)}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='${s.sellerInitial}'"></div>
    <div><div class="seller-name">${s.seller}</div><div class="seller-level">${s.sellerLv}</div></div>
  </div>
  <div class="svc-title">${s.title}</div>
  <div class="rating-row">
    <span class="stars">${'<i class="fa-solid fa-star"></i>'.repeat(5)}</span>
    <span class="rating-n">${ratingVal}</span>
    <span class="rating-c">(${s.reviews})</span>
    <span style="font-size:11px;color:var(--text3);margin-right:auto"><i class="fa-solid fa-clock"></i> ${s.delivery}</span>
  </div>
  <div class="svc-footer">
    <div class="price-wrap">
      <div class="price-from">يبدأ من</div>
      <div class="price-val">${s.price}$</div>
    </div>
    <button class="btn-order ripple" onclick="event.stopPropagation();openOrderModal('${safeTitle}','${s.price}$')">اطلب الآن</button>
  </div>
</div>
  </div>`;
}

async function populateGrid(gridId, cat) {
  const el = document.getElementById(gridId);
  if (!el) return;
  const skelHtml = Array(4).fill(0).map(() => `
    <div class="skel-card">
      <div class="skel-thumb skeleton"></div>
      <div class="skel-body">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <div class="skel-av skeleton"></div>
          <div style="flex:1"><div class="skel-line skeleton med" style="margin-bottom:6px"></div><div class="skel-line skeleton short"></div></div>
        </div>
        <div class="skel-line skeleton" style="margin-bottom:8px"></div>
        <div class="skel-line skeleton short"></div>
      </div>
    </div>`).join('');
  el.innerHTML = skelHtml;

  try {
    let svcs;
    if (_sb) {
      let query = _sb.from('services').select('*');
      if (cat !== 'all') query = query.eq('cat', cat);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(40);
      if (error) throw error;
      svcs = (data || []).map(normalizeService);
      // Merge into ALL_SERVICES cache (avoid duplicates)
      svcs.forEach(s => { if (!ALL_SERVICES.find(x => String(x.id) === String(s.id))) ALL_SERVICES.push(s); });
    } else {
      await new Promise(r => setTimeout(r, 400)); // brief skeleton delay in demo
      svcs = cat === 'all' ? SERVICES : SERVICES.filter(s => s.cat === cat);
    }
    el.innerHTML = svcs.length
      ? svcs.map(renderCard).join('')
      : `<div style="text-align:center;padding:60px 20px;width:100%;grid-column:1/-1"><div style="font-size:52px;margin-bottom:16px">📦</div><p style="font-size:16px;font-weight:600;color:var(--text2)">لا توجد خدمات في هذا التصنيف حالياً</p></div>`;
  } catch(e) {
    // Fallback to static services on any error
    const svcs = cat === 'all' ? SERVICES : SERVICES.filter(s => s.cat === cat);
    if (svcs.length) {
      el.innerHTML = svcs.map(renderCard).join('');
    } else {
      el.innerHTML = `<div style="text-align:center;padding:60px 20px;width:100%;grid-column:1/-1">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <p style="font-size:16px;font-weight:700;color:var(--text2);margin-bottom:8px">تعذّر تحميل الخدمات</p>
        <p style="font-size:13px;color:var(--text3);margin-bottom:20px">تحقق من الإنترنت وأعد المحاولة</p>
        <button class="btn-ghost" style="font-size:13px;padding:10px 22px" onclick="populateGrid('${gridId}','${cat}')">
          <i class="fa-solid fa-rotate-right"></i> إعادة المحاولة
        </button>
      </div>`;
    }
  }
}

// ═══════════════════════════════════════════════════
// SERVICES: ADD (Firestore)
// ═══════════════════════════════════════════════════
async function submitAddService(e) {
  if (e) e.preventDefault();
  if (!currentUser) { showPage('auth'); showToast('⚠️ سجّل دخولك أولاً لإضافة خدمة'); return; }
  const title    = document.getElementById('addTitle')?.value?.trim();
  const cat      = document.getElementById('addCat')?.value;
  const delivery = document.getElementById('addDelivery')?.value || '3 أيام';
  const desc     = document.getElementById('addDesc')?.value?.trim();
  const price    = Number(document.getElementById('addPrice')?.value) || 0;
  const tagsRaw  = document.getElementById('addTags')?.value?.trim();
  const img      = document.getElementById('addImg')?.value?.trim();
  if (!title) { showToast('⚠️ الرجاء إدخال عنوان الخدمة'); return; }
  if (!cat)   { showToast('⚠️ الرجاء اختيار التخصص'); return; }
  if (!price || price < 5) { showToast('⚠️ الرجاء إدخال سعر صحيح (5$ فأكثر)'); return; }

  const sellerName    = userProfile?.name || currentUser.user_metadata?.full_name || 'بائع';
  const catBadges     = { video: 'badge-red', design: 'badge-amber', writing: 'badge-green' };
  const catLabels     = { video: '🎬 فيديو', design: '🎨 تصميم', writing: '✍️ كتابة' };
  const catColors     = { video: '#dc2626', design: '#d97706', writing: '#059669' };
  const defaultImg    = 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400&q=70';

  const newRow = {
    title, cat,
    description: desc || '',
    price,
    delivery,
    seller_id:      currentUser.id,
    seller_name:    sellerName,
    seller_level:   '🌟 جديد ومميز',
    seller_initial: sellerName[0],
    seller_img:     '',
    img:            img || defaultImg,
    tags:           tagsRaw ? tagsRaw.split(/[,،]/).map(t => t.trim()).filter(Boolean) : [],
    rating:         0,
    reviews:        0,
    badge:          '',
    badge_txt:      '',
    cat_badge:      catBadges[cat] || '',
    cat_badge_txt:  catLabels[cat]  || cat,
    cat_color:      catColors[cat]  || '#6d28d9',
    featured:       false,
  };

  if (_sb) {
    try {
      const { data, error } = await _sb.from('services').insert(newRow).select().single();
      if (error) throw error;
      const normalized = normalizeService(data);
      ALL_SERVICES.push(normalized);
      myServicesCache.push(normalized);
      // Clear form
      ['addTitle','addDesc','addTags','addImg'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      showToast('✅ تم نشر خدمتك بنجاح! يمكنك مراجعتها في لوحة التحكم.');
      showPage('dashboard');
      switchDashTab('services');
      renderMyServices();
    } catch(e) { showToast('❌ خطأ: ' + e.message); }
  } else {
    // Demo mode
    const localId = Date.now();
    const demo = { ...normalizeService({ ...newRow, id: localId, sub: cat }), sellerImg: '' };
    SERVICES.push(demo);
    ALL_SERVICES.push(demo);
    myServicesCache.push(demo);
    showToast('✅ تم إضافة الخدمة (demo mode)');
    showPage('dashboard');
    switchDashTab('services');
    renderMyServices();
  }
}

// ═══════════════════════════════════════════════════
// SERVICES: LOAD MY SERVICES (Dashboard)
// ═══════════════════════════════════════════════════
async function loadMyServices() {
  if (!currentUser) return;
  if (_sb) {
    try {
      const { data, error } = await _sb.from('services').select('*').eq('seller_id', currentUser.id).order('created_at', { ascending: false });
      if (error) throw error;
      myServicesCache = (data || []).map(normalizeService);
    } catch(e) { myServicesCache = []; }
  } else {
    myServicesCache = SERVICES.filter(s => s.sellerId === currentUser.id);
  }
  renderMyServices();
}

function renderMyServices() {
  const el = document.getElementById('myServicesList');
  if (!el) return;
  document.getElementById('dStatSvcs').textContent = myServicesCache.length;
  document.getElementById('tbadge-services').textContent = myServicesCache.length;
  if (!myServicesCache.length) {
    el.innerHTML = `<div class="empty-dash"><div class="empty-icon">📦</div><p>لا توجد خدمات منشورة بعد</p><button class="btn-hero ripple" style="font-size:13px;padding:11px 22px" onclick="showPage('add-service')"><i class="fa-solid fa-plus"></i> أضف خدمتك الأولى</button></div>`; return;
  }
  el.innerHTML = myServicesCache.map(s => `
    <div class="my-svc-card">
      <img class="my-svc-thumb" src="${s.img || ''}" alt="${s.title}" onerror="this.style.background='var(--bg3)'">
      <div class="my-svc-info">
        <div class="my-svc-title">${s.title}</div>
        <div class="my-svc-meta">
          <span><i class="fa-solid fa-tag"></i> ${s.price}$</span>
          <span><i class="fa-solid fa-star" style="color:#f59e0b"></i> ${s.rating || 0}</span>
          <span><i class="fa-solid fa-comment"></i> ${s.reviews || 0} تقييم</span>
        </div>
      </div>
      <div class="my-svc-actions">
        <button class="btn-sm btn-sm-edit" onclick="openEditModal('${s.id}')"><i class="fa-solid fa-pen"></i> تعديل</button>
        <button class="btn-sm btn-sm-del" onclick="deleteMyService('${s.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
// SERVICES: EDIT / DELETE
// ═══════════════════════════════════════════════════
function openEditModal(id) {
  const s = myServicesCache.find(x => String(x.id) === String(id));
  if (!s) return;
  document.getElementById('editServiceId').value  = id;
  document.getElementById('editTitle').value      = s.title;
  document.getElementById('editCat').value        = s.cat;
  document.getElementById('editPrice').value      = s.price;
  document.getElementById('editDesc').value       = s.desc || '';
  document.getElementById('editServiceModal').classList.add('open');
}
function closeEditModal() { document.getElementById('editServiceModal').classList.remove('open'); }

async function saveEditedService() {
  const id    = document.getElementById('editServiceId').value;
  const title = document.getElementById('editTitle').value.trim();
  const cat   = document.getElementById('editCat').value;
  const price = Number(document.getElementById('editPrice').value);
  const desc  = document.getElementById('editDesc').value.trim();
  if (!title || !price) { showToast('⚠️ الرجاء إكمال جميع الحقول'); return; }
  if (_sb) {
    try {
      const { error } = await _sb.from('services').update({ title, cat, price, description: desc }).eq('id', id);
      if (error) throw error;
    } catch(e) { showToast('❌ ' + e.message); return; }
  } else {
    const idx = myServicesCache.findIndex(x => String(x.id) === String(id));
    if (idx !== -1) { myServicesCache[idx] = { ...myServicesCache[idx], title, cat, price, desc }; }
    const sIdx = ALL_SERVICES.findIndex(x => String(x.id) === String(id));
    if (sIdx !== -1) { ALL_SERVICES[sIdx] = { ...ALL_SERVICES[sIdx], title, cat, price, desc }; }
  }
  showToast('✅ تم تعديل الخدمة بنجاح');
  closeEditModal();
  await loadMyServices();
}

async function deleteMyService(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الخدمة؟')) return;
  if (_sb) {
    try {
      const { error } = await _sb.from('services').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { showToast('❌ ' + e.message); return; }
  } else {
    const idx = myServicesCache.findIndex(x => String(x.id) === String(id));
    if (idx !== -1) myServicesCache.splice(idx, 1);
    const sIdx = ALL_SERVICES.findIndex(x => String(x.id) === String(id));
    if (sIdx !== -1) ALL_SERVICES.splice(sIdx, 1);
  }
  showToast('🗑️ تم حذف الخدمة');
  renderMyServices();
}

// ═══════════════════════════════════════════════════
// FAVORITES / SAVED SERVICES
// ═══════════════════════════════════════════════════
function loadUserSavedServices() {
  const stored = localStorage.getItem('nagriva-saved');
  savedIds = new Set(JSON.parse(stored || '[]'));
  document.getElementById('dStatSaved').textContent = savedIds.size;
  document.getElementById('tbadge-saved').textContent = savedIds.size;
}

function toggleSave(id, btn) {
  const key = String(id);
  if (savedIds.has(key)) {
    savedIds.delete(key);
    if (btn) { btn.classList.remove('saved'); btn.innerHTML = '<i class="fa-regular fa-heart"></i>'; }
    showToast('💔 أُزيل من المحفوظات');
  } else {
    savedIds.add(key);
    if (btn) { btn.classList.add('saved'); btn.innerHTML = '<i class="fa-solid fa-heart"></i>'; }
    showToast('❤️ أُضيف إلى المحفوظات');
  }
  localStorage.setItem('nagriva-saved', JSON.stringify([...savedIds]));
  document.getElementById('dStatSaved').textContent = savedIds.size;
  document.getElementById('tbadge-saved').textContent = savedIds.size;
  renderSavedServices();
}

function renderSavedServices() {
  const el = document.getElementById('mySavedList');
  if (!el) return;
  const pool = ALL_SERVICES.length ? ALL_SERVICES : SERVICES;
  const savedSvcs = pool.filter(s => savedIds.has(String(s.id)));
  if (!savedSvcs.length) {
    el.innerHTML = `<div class="empty-dash"><div class="empty-icon">❤️</div><p>لم تحفظ أي خدمات بعد</p><button class="btn-ghost" style="font-size:13px;padding:10px 20px" onclick="showPage('home')"><i class="fa-solid fa-compass"></i> استكشف الخدمات</button></div>`; return;
  }
  el.innerHTML = savedSvcs.map(s => `
    <div class="my-svc-card">
      <img class="my-svc-thumb" src="${s.img}" alt="${escHtml(s.title)}" loading="lazy">
      <div class="my-svc-info">
        <div class="my-svc-title">${s.title}</div>
        <div class="my-svc-meta"><span>${escHtml(s.seller)}</span><span><strong style="color:var(--accent2)">${s.price}$</strong></span></div>
      </div>
      <div class="my-svc-actions">
        <button class="btn-sm btn-sm-edit" onclick="viewService('${s.id}')"><i class="fa-solid fa-eye"></i> عرض</button>
        <button class="btn-sm btn-sm-del" onclick="toggleSave('${s.id}')"><i class="fa-solid fa-heart-crack"></i></button>
      </div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
// NOTIFICATIONS (Firestore real-time)
// ═══════════════════════════════════════════════════
const DEMO_NOTIFS = [
  { id: 1, text: 'رسالة جديدة من المصمم أحمد بخصوص طلبك', time: 'منذ 3 دقائق', read: false, icon: 'fa-comment-dots', iconColor: 'var(--accent2)' },
  { id: 2, text: 'حصلت خدمتك على تقييم 5 نجوم! ⭐',         time: 'منذ ساعة',    read: false, icon: 'fa-star',        iconColor: '#f59e0b'        },
  { id: 3, text: 'تم تأكيد طلبك بقيمة 120$ بنجاح',            time: 'منذ 3 ساعات', read: true,  icon: 'fa-check-circle', iconColor: '#10b981'       },
];
let _notifData = [...DEMO_NOTIFS];

async function subscribeNotifications() {
  renderNotifications();
  if (!_sb || !currentUser) return;
  // Initial fetch
  try {
    const { data } = await _sb.from('notifications').select('*')
      .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20);
    if (data && data.length) { _notifData = data; renderNotifications(); }
  } catch(e) {}
  // Real-time subscription
  if (_notifChannel) _sb.removeChannel(_notifChannel);
  _notifChannel = _sb.channel('notif-' + currentUser.id)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${currentUser.id}`
    }, () => {
      // Re-fetch on any change
      _sb.from('notifications').select('*')
        .eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(20)
        .then(({ data }) => { if (data) { _notifData = data; renderNotifications(); } });
    })
    .subscribe();
}

function renderNotifications() {
  const panel = document.getElementById('notifPanel');
  const count = document.getElementById('notifCount');
  const unread = _notifData.filter(n => !n.read).length;
  if (count) { count.textContent = unread; count.style.display = unread ? '' : 'none'; }
  const list = _notifData.slice(0,6).map(n => `
    <div class="notif-item${n.read?' ':' unread'}" onclick="markNotifRead('${n.id}')">
      ${!n.read ? '<div class="notif-dot"></div>' : '<div class="notif-dot read"></div>'}
      <div>
        <div class="notif-text"><i class="fa-solid ${n.icon||'fa-bell'}" style="color:${n.iconColor||'var(--accent2)'};margin-left:4px"></i>${n.text}</div>
        <div class="notif-time">${n.time || ''}</div>
      </div>
    </div>`).join('');
  const head = panel.querySelector('.notif-head');
  if (head) { head.innerHTML = `<h4><i class="fa-solid fa-bell" style="color:var(--accent2);margin-left:6px"></i> الإشعارات ${unread?`<span style="background:#ef4444;color:#fff;border-radius:20px;font-size:10px;padding:2px 7px;margin-right:6px">${unread}</span>`:''}</h4><button class="notif-clear" onclick="markAllNotifsRead()">تحديد الكل كمقروء</button>`; }
  // Replace existing items
  const existingItems = panel.querySelectorAll('.notif-item');
  existingItems.forEach(i => i.remove());
  head.insertAdjacentHTML('afterend', list || `<div style="padding:20px;text-align:center;color:var(--text3)"><i class="fa-solid fa-bell-slash" style="font-size:28px;display:block;margin-bottom:10px"></i>لا توجد إشعارات</div>`);
}

function markNotifRead(id) {
  const n = _notifData.find(x => String(x.id) === String(id));
  if (n) n.read = true;
  renderNotifications();
  if (_sb && currentUser) _sb.from('notifications').update({ read: true }).eq('id', id).catch(() => {});
}

function markAllNotifsRead() {
  _notifData.forEach(n => n.read = true);
  renderNotifications();
  if (_sb && currentUser) {
    _sb.from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════
function loadDashboard() {
  if (!currentUser) { showPage('auth'); return; }
  const name  = userProfile?.name || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'المستخدم';
  const initial = name[0] || 'م';
  const photoURL = userProfile?.avatar_url || currentUser.user_metadata?.avatar_url || null;
  document.getElementById('dashName').textContent = name;
  document.getElementById('dashRole').textContent = userProfile?.role === 'seller' ? '💼 بائع' : userProfile?.role === 'both' ? '🔄 بائع وعميل' : '🛒 عميل';
  const av = document.getElementById('dashAv');
  if (photoURL) av.innerHTML = `<img src="${photoURL}" alt="${name}">`;
  else av.textContent = initial;
  // Settings fields
  const sName = document.getElementById('settingsName'); if (sName) sName.value = name;
  const sEmail = document.getElementById('settingsEmail'); if (sEmail) sEmail.value = currentUser.email || '';
  const sRole = document.getElementById('settingsRole'); if (sRole) sRole.value = userProfile?.role || 'buyer';
  const sBio = document.getElementById('settingsBio'); if (sBio) sBio.value = userProfile?.bio || '';
  // Stats
  document.getElementById('dStatSaved').textContent = savedIds.size;
  document.getElementById('tbadge-saved').textContent = savedIds.size;
  loadMyServices();
  loadMyOrders();
}

function switchDashTab(tab) {
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  const btn = document.getElementById('dtab-' + tab);
  const panel = document.getElementById('dpanel-' + tab);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
  if (tab === 'saved')  renderSavedServices();
  if (tab === 'orders') loadMyOrders();
}

// ═══════════════════════════════════════════════════
// CHAT SYSTEM
// ═══════════════════════════════════════════════════
let chatCurrentThread = { id: 'ahmed', name: 'أحمد الخميسي', initial: 'أ' };

function openChatThread(id, name, initial) {
  chatCurrentThread = { id, name, initial };
  document.querySelectorAll('.chat-contact').forEach(c => c.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById('chatHeadAv').textContent = initial;
  document.getElementById('chatHeadName').textContent = name;
  // Remove unread badge if any
  const badge = event.currentTarget.querySelector('.chat-contact-unread');
  if (badge) badge.remove();
  if (_sb && currentUser) {
    // Load existing messages
    const threadId = [currentUser.id, id].sort().join('_');
    chatThreadId = threadId;
    _sb.from('messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: true }).limit(50)
      .then(({ data }) => { if (data) renderSupabaseMessages(data); });
    // Real-time subscription
    if (_chatChannel) _sb.removeChannel(_chatChannel);
    _chatChannel = _sb.channel('chat-' + threadId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        payload => {
          const container = document.getElementById('chatLiveMessages');
          if (container && payload.new) {
            const m = payload.new;
            const isMine = m.sender_id === currentUser.id;
            container.innerHTML += `<div class="msg-wrap ${isMine?'sent':'received'}">
              <div class="msg-av">${isMine ? (userProfile?.name||'أ')[0] : chatCurrentThread.initial}</div>
              <div><div class="msg-bubble">${escHtml(m.text)}</div><div class="msg-time">${m.time_str||''}</div></div>
            </div>`;
            container.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        })
      .subscribe();
  }
}

function renderFirestoreMessages(msgs) {
  const container = document.getElementById('chatLiveMessages');
  if (!container) return;
  container.innerHTML = msgs.map(m => {
    const isMine = m.senderId === currentUser?.id;
    return `<div class="msg-wrap ${isMine?'sent':'received'}">
      <div class="msg-av">${isMine ? (userProfile?.name||'أ')[0] : chatCurrentThread.initial}</div>
      <div><div class="msg-bubble">${escHtml(m.text)}</div><div class="msg-time">${m.timeStr||''}</div></div>
    </div>`;
  }).join('');
  container.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function renderSupabaseMessages(msgs) {
  const container = document.getElementById('chatLiveMessages');
  if (!container) return;
  container.innerHTML = msgs.map(m => {
    const isMine = m.sender_id === currentUser?.id;
    return `<div class="msg-wrap ${isMine?'sent':'received'}">
      <div class="msg-av">${isMine ? (userProfile?.name||'أ')[0] : chatCurrentThread.initial}</div>
      <div><div class="msg-bubble">${escHtml(m.text)}</div><div class="msg-time">${m.time_str||''}</div></div>
    </div>`;
  }).join('');
  container.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

async function sendChatMessage() {
  const input = document.getElementById('chatInputField');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  const now = new Date();
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');

  if (_sb && currentUser) {
    const threadId = chatThreadId || [currentUser.id, chatCurrentThread.id].sort().join('_');
    try {
      const { error } = await _sb.from('messages').insert({
        thread_id:   threadId,
        sender_id:   currentUser.id,
        sender_name: userProfile?.name || currentUser.user_metadata?.full_name || 'أنت',
        text,
        time_str:    timeStr,
        created_at:  new Date().toISOString()
      });
      if (error) throw error;
      // Realtime subscription will render the new message
    } catch(e) { showToast('❌ ' + e.message); }
  } else {
    // Demo mode: append directly to UI
    const container = document.getElementById('chatLiveMessages');
    container.innerHTML += `<div class="msg-wrap sent"><div class="msg-av">أ</div><div><div class="msg-bubble">${escHtml(text)}</div><div class="msg-time">${timeStr}</div></div></div>`;
    container.scrollIntoView({ behavior: 'smooth', block: 'end' });
    // Simulate reply after 1.5s in demo mode
    setTimeout(() => {
      const replies = ['شكراً على رسالتك! سأرد في أقرب وقت.','حسناً، سأبدأ العمل على ذلك.','مفهوم تماماً، سأرسل لك نموذج أولي خلال 24 ساعة.'];
      const reply = replies[Math.floor(Math.random()*replies.length)];
      container.innerHTML += `<div class="msg-wrap received"><div class="msg-av">${chatCurrentThread.initial}</div><div><div class="msg-bubble">${reply}</div><div class="msg-time">${timeStr}</div></div></div>`;
      container.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 1500);
  }
}

function openChatWith(sellerId, sellerName, sellerInitial) {
  showPage('chat');
  // Find or create thread
  const contacts = document.getElementById('chatContactsList');
  const existing = contacts?.querySelector(`[onclick*="${sellerId}"]`);
  if (existing) existing.click();
  else {
    openChatThread(sellerId, sellerName, sellerInitial);
    document.getElementById('chatHeadAv').textContent = sellerInitial;
    document.getElementById('chatHeadName').textContent = sellerName;
  }
}

// ═══════════════════════════════════════════════════
// SERVICE DETAIL
// ═══════════════════════════════════════════════════
async function viewService(id) {
  // Look up in local cache first, then fetch from Supabase if needed
  let s = ALL_SERVICES.find(x => String(x.id) === String(id));
  if (!s && _sb) {
    try {
      const { data } = await _sb.from('services').select('*').eq('id', id).single();
      if (data) { s = normalizeService(data); ALL_SERVICES.push(s); }
    } catch(e) {}
  }
  if (!s) return;
  if (!s) return;
  const detailEl = document.getElementById('detailContent');
  const catName = s.cat === 'video' ? 'مونتاج الفيديو' : s.cat === 'design' ? 'التصميم والهوية' : 'كتابة المحتوى';
  const safeSeller  = s.seller.replace(/'/g,"\\'");
  const safeInitial = s.sellerInitial.replace(/'/g,"\\'");
  const safeTitle   = s.title.replace(/'/g,"\\'").replace(/"/g,'&quot;');
  const priceStd = s.priceStd || Math.round(s.price * 1.7);
  const pricePro = s.pricePro || Math.round(s.price * 3.1);
  // Package feature lists per tier
  const pkgFeatures = {
    basic: [
      `تسليم خلال ${s.delivery}`,
      'تعديل واحد مجاني',
      'ملف التصدير النهائي',
      'دعم عبر الرسائل'
    ],
    standard: [
      `تسليم مبكر (${s.delivery.replace(/\d+/, n => Math.max(1, parseInt(n)-1))})`,
      '3 تعديلات مجانية',
      'ملفات المصدر مشمولة',
      'أولوية في الرد',
      'مراجعة مفصّلة للمشروع'
    ],
    pro: [
      'تسليم فائق السرعة',
      'تعديلات غير محدودة',
      'جميع الملفات المصدرية',
      'دعم VIP على مدار الساعة',
      'مكالمة استشارية مجانية',
      'ضمان الرضا التام أو استرداد'
    ]
  };
  detailEl.innerHTML = `
<div class="detail-main">
  <nav class="detail-breadcrumb">
    <a href="#" onclick="showPage('home')">الرئيسية</a>
    <span class="sep"><i class="fa-solid fa-chevron-left" style="font-size:9px"></i></span>
    <a href="#" onclick="showPage('cat-${s.cat}')">${catName}</a>
    <span class="sep"><i class="fa-solid fa-chevron-left" style="font-size:9px"></i></span>
    <span>${s.title.substring(0,46)}…</span>
  </nav>

  <div class="detail-gallery"><img src="${s.img}" alt="${escHtml(s.title)}" loading="lazy"></div>

  <div class="detail-seller-row" onclick="viewSellerProfile('${String(s.id)}')">
    <div class="dsr-av">
      <img src="${s.sellerImg||''}" alt="${escHtml(s.seller)}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='${safeInitial}'">
    </div>
    <div>
      <div class="dsr-name">${escHtml(s.seller)}</div>
      <div class="dsr-level">${s.sellerLv}</div>
    </div>
    ${s.sellerLv.includes('Top') ? '<span class="badge-top-seller-tag" style="margin-right:auto">🏆 Top Seller</span>' : ''}
    <i class="fa-solid fa-arrow-up-right-from-square dsr-arrow"></i>
  </div>

  <h1 class="detail-title">${escHtml(s.title)}</h1>
  <div class="detail-meta">
    <span class="detail-meta-item badge ${s.catBadge}">${s.catBadgeTxt}</span>
    <span class="detail-meta-item"><i class="fa-solid fa-star" style="color:#f59e0b"></i> ${s.rating||'جديد'} <span style="color:var(--text3);font-weight:400">(${s.reviews} تقييم)</span></span>
    <span class="detail-meta-item"><i class="fa-solid fa-clock" style="color:var(--accent2)"></i> ${s.delivery}</span>
    <span class="detail-meta-item"><i class="fa-solid fa-circle-check" style="color:#10b981"></i> 97% إنجاز</span>
  </div>

  <!-- Mobile-only packages section (hidden on desktop via CSS) -->
  <div class="detail-mobile-pkg">
    <div class="mpkg-header"><i class="fa-solid fa-layer-group" style="color:var(--accent2);margin-left:7px"></i> اختر الحزمة المناسبة</div>
    <div class="pkg-tabs">
      <button class="pkg-tab active" onclick="switchPkg(this,'mpkg-basic')">
        <i class="fa-solid fa-box" style="font-size:11px;margin-left:4px"></i> أساسي
      </button>
      <button class="pkg-tab" onclick="switchPkg(this,'mpkg-standard')">
        <i class="fa-solid fa-star" style="font-size:11px;margin-left:4px;color:#f59e0b"></i> متقدم
      </button>
      <button class="pkg-tab" onclick="switchPkg(this,'mpkg-pro')">
        <i class="fa-solid fa-rocket" style="font-size:11px;margin-left:4px"></i> احترافي
      </button>
    </div>
    <div class="pkg-tab-panel active" id="mpkg-basic">
      <div class="pkg-card">
        <div class="pkg-price-row">
          <span class="pkg-price-val">${s.price}$</span>
          <span class="pkg-price-label">/ الحزمة الأساسية</span>
        </div>
        <div class="pkg-delivery"><i class="fa-solid fa-clock" style="color:var(--accent2)"></i> تسليم: ${s.delivery}</div>
        <ul class="pkg-features">
          ${pkgFeatures.basic.map(f=>`<li><i class="fa-solid fa-check"></i>${f}</li>`).join('')}
        </ul>
        <button class="pkg-order-btn ripple" onclick="openOrderModal('${safeTitle} — أساسي','${s.price}$')">
          <i class="fa-solid fa-cart-shopping"></i> اطلب الحزمة الأساسية
        </button>
      </div>
    </div>
    <div class="pkg-tab-panel" id="mpkg-standard">
      <div class="pkg-card" style="border-color:rgba(109,40,217,.35)">
        <div class="pkg-popular-badge"><i class="fa-solid fa-fire" style="font-size:10px"></i> الأكثر طلباً</div>
        <div class="pkg-price-row">
          <span class="pkg-price-val">${priceStd}$</span>
          <span class="pkg-price-label">/ الحزمة المتقدمة</span>
        </div>
        <div class="pkg-delivery"><i class="fa-solid fa-clock" style="color:var(--accent2)"></i> تسليم مبكر</div>
        <ul class="pkg-features">
          ${pkgFeatures.standard.map(f=>`<li><i class="fa-solid fa-check"></i>${f}</li>`).join('')}
        </ul>
        <button class="pkg-order-btn ripple" onclick="openOrderModal('${safeTitle} — متقدم','${priceStd}$')">
          <i class="fa-solid fa-cart-shopping"></i> اطلب الحزمة المتقدمة
        </button>
      </div>
    </div>
    <div class="pkg-tab-panel" id="mpkg-pro">
      <div class="pkg-card" style="border-color:rgba(245,158,11,.4);background:linear-gradient(135deg,var(--card) 0%,rgba(245,158,11,.04) 100%)">
        <div style="font-size:10px;font-weight:800;color:#d97706;letter-spacing:.8px;margin-bottom:6px;text-transform:uppercase">🏆 الخيار الاحترافي</div>
        <div class="pkg-price-row">
          <span class="pkg-price-val" style="background:linear-gradient(135deg,#f59e0b,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${pricePro}$</span>
          <span class="pkg-price-label">/ الحزمة الاحترافية</span>
        </div>
        <div class="pkg-delivery"><i class="fa-solid fa-bolt" style="color:#f59e0b"></i> تسليم فائق السرعة</div>
        <ul class="pkg-features">
          ${pkgFeatures.pro.map(f=>`<li><i class="fa-solid fa-check" style="color:#f59e0b"></i>${f}</li>`).join('')}
        </ul>
        <button class="pkg-order-btn ripple" style="background:linear-gradient(135deg,#f59e0b,#f97316);box-shadow:0 4px 16px rgba(245,158,11,.4)" onclick="openOrderModal('${safeTitle} — احترافي','${pricePro}$')">
          <i class="fa-solid fa-rocket"></i> اطلب الحزمة الاحترافية
        </button>
      </div>
    </div>
    <button class="btn-msg-big" style="margin-top:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Cairo';cursor:pointer" onclick="openChatWith('${s.sellerId||'seller-'+s.id}','${safeSeller}','${safeInitial}')">
      <i class="fa-solid fa-comment"></i> راسل البائع قبل الطلب
    </button>
  </div>

  <div class="detail-desc">
    ${escHtml(s.desc || 'يقدم هذا البائع المحترف خدمة عالية الجودة باستخدام أحدث الأدوات والتقنيات. خبرة تمتد لأكثر من 5 سنوات في المجال، مع ضمان التعديلات حتى رضاك التام. تواصل مع البائع قبل الطلب لمناقشة تفاصيل مشروعك.')}
  </div>
  <div class="detail-tags">
    ${(s.tags||[]).map(t=>`<span class="dtag">${escHtml(t)}</span>`).join('')}
    <span class="dtag">تعديلات مجانية</span>
    <span class="dtag">ملفات مفتوحة</span>
  </div>

  <div class="reviews-section">
    <h3><i class="fa-solid fa-star" style="color:#f59e0b"></i> آراء العملاء (${s.reviews})</h3>
    <div id="serviceReviews">${s.reviews > 0 ? renderDemoReviews() : '<div class="empty-dash" style="padding:24px"><div class="empty-icon" style="font-size:32px">⭐</div><p>لا توجد تقييمات بعد — كن أول من يقيّم!</p></div>'}</div>
    <div id="reviewForm" style="margin-top:20px;padding:18px;background:var(--bg3);border-radius:14px;border:1px solid var(--border)">
      <div class="dash-section-title"><i class="fa-solid fa-pen" style="color:var(--accent2)"></i> أضف تقييمك</div>
      <div style="display:flex;gap:10px;margin-bottom:14px;font-size:26px">
        ${[1,2,3,4,5].map(n=>`<span style="cursor:pointer;opacity:.35;transition:.15s" id="rstar${n}" onclick="setReviewStar(${n})">⭐</span>`).join('')}
      </div>
      <textarea class="form-input" id="reviewText" placeholder="شاركنا رأيك في هذه الخدمة..." style="min-height:84px;resize:vertical;margin-bottom:10px"></textarea>
      <button class="btn-order ripple" onclick="submitReview(${s.id})"><i class="fa-solid fa-paper-plane"></i> إرسال التقييم</button>
    </div>
  </div>

  <div class="suggestions-section">
    <div class="suggestions-title"><i class="fa-solid fa-wand-magic-sparkles" style="color:var(--accent2)"></i> خدمات مشابهة قد تعجبك</div>
    <div class="suggestions-row" id="suggRow">
      ${getSuggestions(s.cat, s.id).map(sx=>`
        <div class="sugg-card" onclick="viewService('${sx.id}')">
          <div class="sugg-thumb"><img src="${sx.img}" alt="${escHtml(sx.title)}" loading="lazy"></div>
          <div class="sugg-body">
            <div class="sugg-title">${escHtml(sx.title)}</div>
            <div class="sugg-price">${sx.price}$</div>
          </div>
        </div>`).join('')}
    </div>
  </div>
</div>

<div class="detail-side">
  <div class="order-sticky">
    <div class="pkg-tabs">
      <button class="pkg-tab active" onclick="switchPkg(this,'pkg-basic')">
        <i class="fa-solid fa-box" style="font-size:11px;margin-left:4px"></i> أساسي
      </button>
      <button class="pkg-tab" onclick="switchPkg(this,'pkg-standard')">
        <i class="fa-solid fa-star" style="font-size:11px;margin-left:4px;color:#f59e0b"></i> متقدم
      </button>
      <button class="pkg-tab" onclick="switchPkg(this,'pkg-pro')">
        <i class="fa-solid fa-rocket" style="font-size:11px;margin-left:4px"></i> احترافي
      </button>
    </div>

    <div class="pkg-tab-panel active" id="pkg-basic">
      <div class="pkg-card">
        <div class="pkg-price-row">
          <span class="pkg-price-val">${s.price}$</span>
          <span class="pkg-price-label">/ الحزمة الأساسية</span>
        </div>
        <div class="pkg-delivery"><i class="fa-solid fa-clock" style="color:var(--accent2)"></i> تسليم: ${s.delivery}</div>
        <ul class="pkg-features">
          ${pkgFeatures.basic.map(f=>`<li><i class="fa-solid fa-check"></i>${f}</li>`).join('')}
        </ul>
        <button class="pkg-order-btn ripple" onclick="openOrderModal('${safeTitle} — أساسي','${s.price}$')">
          <i class="fa-solid fa-cart-shopping"></i> اطلب الحزمة الأساسية
        </button>
      </div>
    </div>

    <div class="pkg-tab-panel" id="pkg-standard">
      <div class="pkg-card" style="border-color:rgba(109,40,217,.35)">
        <div class="pkg-popular-badge"><i class="fa-solid fa-fire" style="font-size:10px"></i> الأكثر طلباً</div>
        <div class="pkg-price-row">
          <span class="pkg-price-val">${priceStd}$</span>
          <span class="pkg-price-label">/ الحزمة المتقدمة</span>
        </div>
        <div class="pkg-delivery"><i class="fa-solid fa-clock" style="color:var(--accent2)"></i> تسليم مبكر</div>
        <ul class="pkg-features">
          ${pkgFeatures.standard.map(f=>`<li><i class="fa-solid fa-check"></i>${f}</li>`).join('')}
        </ul>
        <button class="pkg-order-btn ripple" onclick="openOrderModal('${safeTitle} — متقدم','${priceStd}$')">
          <i class="fa-solid fa-cart-shopping"></i> اطلب الحزمة المتقدمة
        </button>
      </div>
    </div>

    <div class="pkg-tab-panel" id="pkg-pro">
      <div class="pkg-card" style="border-color:rgba(245,158,11,.4);background:linear-gradient(135deg,var(--card) 0%,rgba(245,158,11,.04) 100%)">
        <div style="font-size:10px;font-weight:800;color:#d97706;letter-spacing:.8px;margin-bottom:6px;text-transform:uppercase">🏆 الخيار الاحترافي</div>
        <div class="pkg-price-row">
          <span class="pkg-price-val" style="background:linear-gradient(135deg,#f59e0b,#f97316);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${pricePro}$</span>
          <span class="pkg-price-label">/ الحزمة الاحترافية</span>
        </div>
        <div class="pkg-delivery"><i class="fa-solid fa-bolt" style="color:#f59e0b"></i> تسليم فائق السرعة</div>
        <ul class="pkg-features">
          ${pkgFeatures.pro.map(f=>`<li><i class="fa-solid fa-check" style="color:#f59e0b"></i>${f}</li>`).join('')}
        </ul>
        <button class="pkg-order-btn ripple" style="background:linear-gradient(135deg,#f59e0b,#f97316);box-shadow:0 4px 16px rgba(245,158,11,.4)" onclick="openOrderModal('${safeTitle} — احترافي','${pricePro}$')">
          <i class="fa-solid fa-rocket"></i> اطلب الحزمة الاحترافية
        </button>
      </div>
    </div>

    <button class="btn-msg-big" style="margin-top:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Cairo';cursor:pointer" onclick="openChatWith('${s.sellerId||'seller-'+s.id}','${safeSeller}','${safeInitial}')">
      <i class="fa-solid fa-comment"></i> راسل البائع قبل الطلب
    </button>

    <div class="seller-profile-card" style="cursor:pointer" onclick="viewSellerProfile('${String(s.id)}')">
      <div class="seller-prof-head">
        <div class="seller-prof-av">
          <img src="${s.sellerImg||''}" alt="${escHtml(s.seller)}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='${safeInitial}'">
        </div>
        <div>
          <div class="spname">${escHtml(s.seller)}</div>
          <div class="sptitle">${s.sellerLv}</div>
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square" style="margin-right:auto;color:var(--text3);font-size:12px"></i>
      </div>
      <div class="seller-prof-stats">
        <div class="sp-stat"><div class="v">${s.reviews}</div><div class="k">تقييم</div></div>
        <div class="sp-stat"><div class="v">${s.rating||'—'}</div><div class="k">معدل</div></div>
        <div class="sp-stat"><div class="v">97%</div><div class="k">إنجاز</div></div>
        <div class="sp-stat"><div class="v">${s.delivery}</div><div class="k">تسليم</div></div>
      </div>
    </div>
  </div>
</div>`;
  showPage('service-detail');
}

function renderDemoReviews() {
  return [
    { n: 'محمد أ.', r: 'كان التعامل ممتازاً والعمل احترافي بشكل لم أتوقعه. أنصح به بشدة!', t: 'منذ أسبوع', stars: 5 },
    { n: 'سارة م.', r: 'التسليم في الوقت المحدد والجودة فاقت التوقعات. سأتعامل مجدداً.', t: 'منذ 3 أسابيع', stars: 5 },
    { n: 'خالد ب.', r: 'محترف ومتجاوب. طلبت مراجعتين وأجابهما بسرعة. ممتاز.', t: 'منذ شهر', stars: 4 }
  ].map(rv => `
    <div class="review-card">
      <div class="review-head">
        <div class="review-av">${rv.n[0]}</div>
        <div><div class="review-name">${rv.n}</div><div class="review-date">${rv.t}</div></div>
        <div class="stars" style="margin-right:auto">${'<i class="fa-solid fa-star"></i>'.repeat(rv.stars)}</div>
      </div>
      <p class="review-text">${rv.r}</p>
    </div>`).join('');
}

let _reviewStar = 5;
function setReviewStar(n) {
  _reviewStar = n;
  for (let i=1;i<=5;i++) {
    const el = document.getElementById('rstar'+i);
    if (el) el.style.opacity = i<=n ? '1' : '.35';
  }
}

function submitReview(serviceId) {
  const text = document.getElementById('reviewText')?.value?.trim();
  if (!text) { showToast('⚠️ الرجاء كتابة تعليقك'); return; }
  if (!currentUser) { showPage('auth'); showToast('⚠️ سجّل دخولك لإضافة تقييم'); return; }
  const name = userProfile?.name || currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'مستخدم';
  const newReview = `
    <div class="review-card" style="border:1px solid var(--accent2)">
      <div class="review-head">
        <div class="review-av">${name[0]}</div>
        <div><div class="review-name">${name}</div><div class="review-date">الآن</div></div>
        <div class="stars" style="margin-right:auto">${'<i class="fa-solid fa-star"></i>'.repeat(_reviewStar)}</div>
      </div>
      <p class="review-text">${escHtml(text)}</p>
    </div>`;
  const container = document.getElementById('serviceReviews');
  if (container) container.insertAdjacentHTML('afterbegin', newReview);
  document.getElementById('reviewText').value = '';
  showToast('⭐ شكراً! تم إضافة تقييمك بنجاح');
  if (_sb) _sb.from('reviews').insert({ service_id: String(serviceId), user_id: currentUser.id, reviewer_name: name, text, rating: _reviewStar, created_at: new Date().toISOString() }).catch(() => {});
}

// ═══════════════════════════════════════════════════
// CONTACT FORM
// ═══════════════════════════════════════════════════
async function sendContactMessage() {
  const name    = document.getElementById('ctName')?.value?.trim();
  const email   = document.getElementById('ctEmail')?.value?.trim();
  const subject = document.getElementById('ctSubject')?.value;
  const message = document.getElementById('ctMessage')?.value?.trim();
  if (!name || !email || !message) { showToast('⚠️ الرجاء إكمال جميع الحقول المطلوبة'); return; }
  if (_sb) {
    try {
      await _sb.from('contact_messages').insert({ name, email, subject, message, created_at: new Date().toISOString() });
    } catch(e) { console.warn('Contact save error:', e); }
  }
  showToast('✅ تم إرسال رسالتك! سنرد عليك خلال 24 ساعة 📧');
  ['ctName','ctEmail','ctMessage'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
}

// ═══════════════════════════════════════════════════
// PAGE NAVIGATION
// ═══════════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + id);
  if (target) { target.classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  // Populate grids lazily
  if (id === 'home')        populateGrid('homeGrid',    'all');
  if (id === 'cat-video')   populateGrid('videoGrid',   'video');
  if (id === 'cat-design')  populateGrid('designGrid',  'design');
  if (id === 'cat-writing') populateGrid('writingGrid', 'writing');
  // Dashboard: load data
  if (id === 'dashboard')   loadDashboard();
  // Update active links
  document.querySelectorAll('.drawer-body a').forEach(a => {
    a.classList.remove('active');
    if (a.onclick && a.onclick.toString().includes(`'${id}'`)) a.classList.add('active');
  });
  document.querySelectorAll('#navLinks a').forEach(a => {
    a.classList.remove('active');
    if (a.onclick && a.onclick.toString().includes(`'${id}'`)) a.classList.add('active');
  });
}

function setActive(el) {
  document.querySelectorAll('#navLinks a').forEach(a => a.classList.remove('active'));
  el.classList.add('active');
}

// ═══════════════════════════════════════════════════
// DRAWER
// ═══════════════════════════════════════════════════
function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerBg').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerBg').classList.remove('open');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════
function openSearch() {
  document.getElementById('searchOverlay').classList.add('open');
  setTimeout(() => document.getElementById('searchInput').focus(), 100);
}
function closeSearch() { document.getElementById('searchOverlay').classList.remove('open'); }
function handleSearchOverlayClick(e) {
  if (e.target === document.getElementById('searchOverlay')) closeSearch();
}
function doSearch(val) {
  const results = document.getElementById('searchResults');
  const pool = ALL_SERVICES.length ? ALL_SERVICES : SERVICES;
  if (!val.trim()) {
    const defaults = pool.slice(0,4);
    results.innerHTML = defaults.map(s => `
      <div class="search-result" onclick="closeSearch();viewService('${s.id}')">
        <div class="r-icon"><i class="fa-solid fa-${s.cat==='video'?'film':s.cat==='design'?'palette':'pen-fancy'}" style="color:${s.catColor}"></i></div>
        <div><div class="r-name">${escHtml(s.title)}</div><div class="r-meta">${s.catBadgeTxt} · ابتداء من ${s.price}$</div></div>
      </div>`).join(''); return;
  }
  const found = pool.filter(s => s.title.includes(val) || (s.tags||[]).some(t => t.includes(val)));
  results.innerHTML = found.length
    ? found.map(s => `<div class="search-result" onclick="closeSearch();viewService('${s.id}')"><div class="r-icon"><i class="fa-solid fa-${s.cat==='video'?'film':s.cat==='design'?'palette':'pen-fancy'}" style="color:${s.catColor}"></i></div><div><div class="r-name">${escHtml(s.title)}</div><div class="r-meta">${s.catBadgeTxt} · ابتداء من ${s.price}$</div></div></div>`).join('')
    : `<div style="padding:24px;text-align:center;color:var(--text3)"><i class="fa-solid fa-magnifying-glass" style="font-size:28px;margin-bottom:10px;display:block"></i>لا نتائج — جرب كلمة أخرى</div>`;
}

// ═══════════════════════════════════════════════════
// DARK MODE
// ═══════════════════════════════════════════════════
function toggleDark() {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  document.getElementById('darkIcon').className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  localStorage.setItem('nagriva-dark', isDark ? '1' : '0');
}
if (localStorage.getItem('nagriva-dark') === '1') {
  document.body.classList.add('dark');
  document.getElementById('darkIcon').className = 'fa-solid fa-sun';
}

// ═══════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════
function toggleNotif() {
  document.getElementById('notifPanel').classList.toggle('open');
}

// ═══════════════════════════════════════════════════
// GLOBAL CLICK HANDLER
// ═══════════════════════════════════════════════════
document.addEventListener('click', e => {
  const panel = document.getElementById('notifPanel');
  if (panel?.classList.contains('open') && !panel.contains(e.target) && !e.target.closest('#notifBtn'))
    panel.classList.remove('open');
  if (document.getElementById('searchOverlay')?.classList.contains('open') && e.target === document.getElementById('searchOverlay'))
    closeSearch();
  if (!e.target.closest('#navUserWrap')) closeUserDD();
});

// ═══════════════════════════════════════════════════
// ORDER MODAL
// ═══════════════════════════════════════════════════
function openOrderModal(name, price) {
  if (!currentUser) {
    showToast('⚠️ سجّل دخولك أولاً لإتمام الطلب');
    showPage('auth'); return;
  }
  document.getElementById('modalSvcName').textContent = name;
  document.getElementById('modalPrice').textContent = price;
  document.getElementById('orderModal').classList.add('open');
}
function closeModal() { document.getElementById('orderModal').classList.remove('open'); }
async function confirmOrder() {
  closeModal();
  showToast('🎉 تم تأكيد طلبك بنجاح! ستتلقى رسالة تأكيد على بريدك الإلكتروني.');
  if (_sb && currentUser) {
    const svcName = document.getElementById('modalSvcName')?.textContent;
    const price   = document.getElementById('modalPrice')?.textContent;
    await _sb.from('orders').insert({
      buyer_id:     currentUser.id,
      service_name: svcName,
      price,
      status:       'pending',
      created_at:   new Date().toISOString()
    }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════
// ORDERS: LOAD & RENDER (Dashboard)
// ═══════════════════════════════════════════════════
async function loadMyOrders() {
  if (!currentUser) return;
  const el = document.getElementById('myOrdersList');
  if (!el) return;
  if (_sb) {
    try {
      const { data, error } = await _sb.from('orders').select('*').eq('buyer_id', currentUser.id).order('created_at', { ascending: false });
      if (error) throw error;
      renderMyOrders(data || []);
    } catch(e) { renderMyOrders([]); }
  } else {
    renderMyOrders([]);
  }
}

function renderMyOrders(orders) {
  const el = document.getElementById('myOrdersList');
  if (!el) return;
  document.getElementById('dStatOrders').textContent = orders.length;
  document.getElementById('tbadge-orders').textContent = orders.length;
  if (!orders.length) {
    el.innerHTML = `<div class="empty-dash"><div class="empty-icon">🛒</div><p>لا توجد طلبات بعد</p><button class="btn-ghost" style="font-size:13px;padding:10px 20px" onclick="showPage('home')"><i class="fa-solid fa-compass"></i> استكشف الخدمات</button></div>`;
    return;
  }
  const statusLabel = { pending: '⏳ قيد الانتظار', in_progress: '🔄 جارٍ التنفيذ', completed: '✅ مكتمل', cancelled: '❌ ملغي' };
  el.innerHTML = orders.map(o => `
    <div class="my-svc-card">
      <div class="my-svc-info">
        <div class="my-svc-title">${escHtml(o.service_name || 'خدمة')}</div>
        <div class="my-svc-meta">
          <span><i class="fa-solid fa-tag"></i> ${escHtml(String(o.price || ''))}</span>
          <span>${statusLabel[o.status] || o.status}</span>
          <span style="font-size:11px;color:var(--text3)">${new Date(o.created_at).toLocaleDateString('ar-SA')}</span>
        </div>
      </div>
    </div>`).join('');
}
document.getElementById('orderModal')?.addEventListener('click', e => { if (e.target === document.getElementById('orderModal')) closeModal() });

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════
let toastTimer;
function showToast(msg, duration = 3400) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.innerHTML = msg; t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)';
  toastTimer = setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(80px)'; }, duration);
}

// ═══════════════════════════════════════════════════
// AUTH TABS
// ═══════════════════════════════════════════════════
function switchAuth(tab) {
  document.getElementById('loginForm').style.display    = tab==='login' ? '' : 'none';
  document.getElementById('registerForm').style.display = tab==='register' ? '' : 'none';
  document.getElementById('loginTab').classList.toggle('active',    tab==='login');
  document.getElementById('registerTab').classList.toggle('active', tab==='register');
  document.getElementById('loginError').classList.remove('show');
  document.getElementById('registerError').classList.remove('show');
}

// ═══════════════════════════════════════════════════
// CATEGORY FILTER
// ═══════════════════════════════════════════════════
function filterCat(btn, sub, gridId) {
  btn.closest('.filter-tabs').querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const cat = gridId==='videoGrid' ? 'video' : gridId==='designGrid' ? 'design' : 'writing';
  const pool = ALL_SERVICES.length ? ALL_SERVICES : SERVICES;
  const filtered = sub==='all' ? pool.filter(s=>s.cat===cat) : pool.filter(s=>s.cat===cat && s.sub===sub);
  const el = document.getElementById(gridId);
  el.innerHTML = filtered.length
    ? filtered.map(renderCard).join('')
    : `<div style="text-align:center;padding:60px 20px;width:100%;grid-column:1/-1"><div style="font-size:52px;margin-bottom:16px">🔍</div><p style="font-size:16px;font-weight:600;color:var(--text2)">لا توجد خدمات في هذا التصنيف حالياً</p></div>`;
}

// ═══════════════════════════════════════════════════
// SCROLL HANDLER
// ═══════════════════════════════════════════════════
window.addEventListener('scroll', () => {
  const pct = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
  document.getElementById('scrollFill').style.width = Math.min(pct,100) + '%';
  document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 8);
  document.querySelectorAll('.fade-in:not(.visible)').forEach(el => observer.observe(el));
  if (window.scrollY > 120) document.getElementById('notifPanel')?.classList.remove('open');
  document.getElementById('scrollTopBtn').classList.toggle('visible', window.scrollY > 400);
});
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

// ═══════════════════════════════════════════════════
// INTERSECTION OBSERVER (fade-in)
// ═══════════════════════════════════════════════════
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// ═══════════════════════════════════════════════════
// COUNTER ANIMATION
// ═══════════════════════════════════════════════════
function animCount(el, target, duration=1800) {
  if (!el) return;
  let start = 0, step = target / 60;
  const timer = setInterval(() => {
    start = Math.min(start + step, target);
    el.textContent = (start>=1000 ? '+' + (start/1000).toFixed(1) + 'K' : '+' + Math.floor(start));
    if (start >= target) clearInterval(timer);
  }, duration / 60);
}
setTimeout(() => {
  animCount(document.getElementById('sn1'), 5200);
  animCount(document.getElementById('sn2'), 2100);
  animCount(document.getElementById('sn3'), 15000);
}, 400);

// ═══════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSearch(); closeModal(); closeDrawer(); closeEditModal(); document.getElementById('notifPanel')?.classList.remove('open'); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
});

// ═══════════════════════════════════════════════════
// FAQ ACCORDION
// ═══════════════════════════════════════════════════
function toggleFaq(id) {
  const item = document.getElementById(id);
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

// ═══════════════════════════════════════════════════
// VIDEO EXPLAINER
// ═══════════════════════════════════════════════════
function playVideo() {
  const overlay = document.getElementById('videoOverlay');
  const iframe  = document.getElementById('nagrivaVideo');
  if (overlay) overlay.classList.add('hidden');
  if (iframe) { const s = iframe.src; if (!s.includes('autoplay=1')) iframe.src = s + (s.includes('?')?'&':'?') + 'autoplay=1'; }
}

// Add-service button is wired directly via onclick="submitAddService(event)" in the HTML

// ═══════════════════════════════════════════════════
// UTILITY: HTML escape
// ═══════════════════════════════════════════════════
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ═══════════════════════════════════════════════════
window.addEventListener('unhandledrejection', e => {
  const msg = e.reason?.message || '';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
    showToast('⚠️ تعذّر الاتصال بالخادم. تحقق من الإنترنت وأعد المحاولة.');
  } else if (msg && !msg.includes('supabase')) {
    showToast('❌ حدث خطأ غير متوقع. حاول مجدداً.');
  }
});
window.addEventListener('error', e => {
  if (e.message && e.message.includes('script error')) return;
});


// ═══════════════════════════════════════════════════
// PACKAGES: switch active tab in service detail
// ═══════════════════════════════════════════════════
function switchPkg(btn, panelId) {
  btn.closest('.pkg-tabs').querySelectorAll('.pkg-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.pkg-tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
}

// ═══════════════════════════════════════════════════
// SMART SUGGESTIONS: same-category services (excluding current)
// ═══════════════════════════════════════════════════
function getSuggestions(cat, excludeId, limit = 5) {
  const pool = ALL_SERVICES.length ? ALL_SERVICES : SERVICES;
  return pool
    .filter(s => s.cat === cat && String(s.id) !== String(excludeId))
    .sort(() => Math.random() - 0.5)
    .slice(0, limit);
}

// ═══════════════════════════════════════════════════
// SELLER PROFILE PAGE
// ═══════════════════════════════════════════════════
function viewSellerProfile(serviceId) {
  const s = ALL_SERVICES.find(x => String(x.id) === String(serviceId)) ||
            SERVICES.find(x => String(x.id) === String(serviceId));
  if (!s) return;

  // Fill header
  const avEl = document.getElementById('spAv');
  if (avEl) {
    if (s.sellerImg) {
      avEl.innerHTML = `<img src="${s.sellerImg}" alt="${escHtml(s.seller)}" loading="lazy" onerror="this.parentElement.textContent='${s.sellerInitial}'">`;
    } else {
      avEl.textContent = s.sellerInitial;
    }
  }
  document.getElementById('spName').textContent   = s.seller;
  document.getElementById('spLevel').textContent  = s.sellerLv;
  document.getElementById('spReviews').textContent= s.reviews;
  document.getElementById('spRating').textContent = s.rating || '—';
  document.getElementById('spDelivery').textContent= s.delivery;

  // Badges
  const badgeRow = document.getElementById('spBadgeRow');
  if (badgeRow) {
    const badges = [];
    if (s.sellerLv.includes('Top')) badges.push(`<span class="seller-badge-item badge-top-seller"><i class="fa-solid fa-trophy"></i> Top Seller</span>`);
    if (s.featured) badges.push(`<span class="seller-badge-item badge-featured"><i class="fa-solid fa-crown"></i> مختار</span>`);
    if (s.sellerLv.includes('جديد')) badges.push(`<span class="seller-badge-item badge-new-seller"><i class="fa-solid fa-seedling"></i> بائع جديد</span>`);
    badgeRow.innerHTML = badges.join('');
  }

  // Message button
  const msgBtn = document.getElementById('spMsgBtn');
  if (msgBtn) {
    msgBtn.onclick = () => openChatWith(s.sellerId || 'seller-' + s.id, s.seller, s.sellerInitial);
  }

  // Load seller's services grid
  const pool = ALL_SERVICES.length ? ALL_SERVICES : SERVICES;
  const sellerSvcs = pool.filter(x => x.seller === s.seller);
  const grid = document.getElementById('sellerServicesGrid');
  if (grid) {
    grid.innerHTML = sellerSvcs.length
      ? sellerSvcs.map(renderCard).join('')
      : `<div style="text-align:center;padding:60px 20px;width:100%;grid-column:1/-1;color:var(--text3)">
           <i class="fa-solid fa-box" style="font-size:36px;margin-bottom:12px;display:block"></i>
           لا توجد خدمات أخرى لهذا البائع
         </div>`;
  }

  showPage('seller-profile');
}

// ═══════════════════════════════════════════════════
// FILTER BY SELECTS (price range + sort)
// ═══════════════════════════════════════════════════
function filterBySelects(gridId, cat) {
  const priceId  = cat === 'video' ? 'videoPriceFilter' : cat === 'design' ? 'designPriceFilter' : 'writingPriceFilter';
  const sortId   = cat === 'video' ? 'videoSortFilter'  : cat === 'design' ? 'designSortFilter'  : 'writingSortFilter';
  const priceVal = document.getElementById(priceId)?.value || '';
  const sortVal  = document.getElementById(sortId)?.value  || '';

  const pool = ALL_SERVICES.length ? ALL_SERVICES : SERVICES;
  let filtered = pool.filter(s => s.cat === cat);

  // Price filter
  if (priceVal === 'low')  filtered = filtered.filter(s => s.price < 50);
  if (priceVal === 'mid')  filtered = filtered.filter(s => s.price >= 50 && s.price <= 200);
  if (priceVal === 'high') filtered = filtered.filter(s => s.price > 200);

  // Sort
  if (sortVal === 'rating')    filtered.sort((a,b) => (b.rating||0) - (a.rating||0));
  if (sortVal === 'price_asc') filtered.sort((a,b) => a.price - b.price);
  if (sortVal === 'delivery') {
    const hrs = d => {
      if (!d) return 9999;
      if (d.includes('24') || d.includes('ساعة')) return 1;
      const n = parseInt(d) || 7;
      return n;
    };
    filtered.sort((a,b) => hrs(a.delivery) - hrs(b.delivery));
  }

  // Update active dot indicators
  const priceEl = document.getElementById(priceId);
  const sortEl  = document.getElementById(sortId);
  if (priceEl) priceEl.classList.toggle('active-filter', !!priceVal);
  if (sortEl)  sortEl.classList.toggle('active-filter',  !!sortVal);

  const el = document.getElementById(gridId);
  if (!el) return;
  el.innerHTML = filtered.length
    ? filtered.map(renderCard).join('')
    : `<div style="text-align:center;padding:60px 20px;width:100%;grid-column:1/-1">
         <div style="font-size:48px;margin-bottom:14px">🔍</div>
         <p style="font-size:16px;font-weight:700;color:var(--text2);margin-bottom:8px">لا توجد خدمات بهذه المعايير</p>
         <p style="font-size:13px;color:var(--text3);margin-bottom:18px">حاول تغيير فلتر السعر أو الترتيب</p>
       </div>`;
}

// ═══════════════════════════════════════════════════
// TRENDING SECTION
// ═══════════════════════════════════════════════════
function populateTrending() {
  const el = document.getElementById('trendingRow');
  if (!el) return;
  const pool = ALL_SERVICES.length ? ALL_SERVICES : SERVICES;
  // Top trending = highest reviews × rating
  const trending = [...pool]
    .sort((a,b) => (b.reviews * (b.rating||0)) - (a.reviews * (a.rating||0)))
    .slice(0, 10);
  el.innerHTML = trending.map((s, i) => `
    <div class="trend-card" onclick="viewService('${s.id}')">
      <div class="trend-thumb">
        <img src="${s.img}" alt="${escHtml(s.title)}" loading="lazy">
      </div>
      <div class="trend-body">
        <div class="trend-rank">#${i+1}</div>
        <div class="trend-title">${escHtml(s.title)}</div>
        <div class="trend-meta">
          <span><i class="fa-solid fa-star" style="color:#f59e0b;font-size:10px"></i> ${s.rating}</span>
          <span class="trend-price">${s.price}$</span>
        </div>
      </div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
// QUICK ORDER MODAL
// ═══════════════════════════════════════════════════
function openQuickOrder() {
  document.getElementById('quickOrderModal').classList.add('open');
  document.getElementById('quickMatchResults').innerHTML = '';
  document.body.style.overflow = 'hidden';
}
function closeQuickOrder() {
  document.getElementById('quickOrderModal').classList.remove('open');
  document.body.style.overflow = '';
}
function runQuickOrderSearch() {
  const text   = (document.getElementById('quickOrderText')?.value || '').trim().toLowerCase();
  const cat    = document.getElementById('quickOrderCat')?.value || '';
  const budget = document.getElementById('quickOrderBudget')?.value || '';
  const pool   = ALL_SERVICES.length ? ALL_SERVICES : SERVICES;

  let results = [...pool];
  if (cat) results = results.filter(s => s.cat === cat);
  if (budget === 'low')  results = results.filter(s => s.price < 50);
  if (budget === 'mid')  results = results.filter(s => s.price >= 50 && s.price <= 150);
  if (budget === 'high') results = results.filter(s => s.price > 150);
  if (text) {
    results = results.filter(s =>
      s.title.toLowerCase().includes(text) ||
      (s.tags||[]).some(t => t.toLowerCase().includes(text)) ||
      (s.desc||'').toLowerCase().includes(text)
    );
  }
  results = results.sort((a,b) => (b.reviews*(b.rating||0)) - (a.reviews*(a.rating||0))).slice(0,4);

  const el = document.getElementById('quickMatchResults');
  if (!results.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3)">
      <i class="fa-solid fa-magnifying-glass" style="font-size:24px;margin-bottom:8px;display:block"></i>
      لم نجد خدمات مطابقة — حاول تغيير الكلمات أو الفلتر
    </div>`;
    return;
  }
  el.innerHTML = `<p style="font-size:12.5px;color:var(--text3);margin-bottom:10px">وجدنا ${results.length} خدمة مناسبة:</p>` +
    results.map(s => `
      <div class="quick-match-card" onclick="closeQuickOrder();viewService('${s.id}')">
        <img class="quick-match-thumb" src="${s.img}" alt="${escHtml(s.title)}" loading="lazy">
        <div class="quick-match-info">
          <div class="quick-match-title">${escHtml(s.title)}</div>
          <div class="quick-match-meta">${escHtml(s.seller)} · ${s.catBadgeTxt} · <strong style="color:var(--accent2)">${s.price}$</strong></div>
        </div>
        <i class="fa-solid fa-arrow-left" style="color:var(--text3);font-size:12px;flex-shrink:0"></i>
      </div>`).join('');
}

// ═══════════════════════════════════════════════════
// UPDATE showPage TO SUPPORT NEW PAGES & TRENDING
// ═══════════════════════════════════════════════════
const _origShowPage = showPage;
showPage = function(id) {
  _origShowPage(id);
  if (id === 'home') populateTrending();
};

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
populateGrid('homeGrid', 'all');
populateTrending();
renderNotifications();
loadUserSavedServices();
