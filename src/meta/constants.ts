// src/meta/constants.ts

/**
 * REST Countries API endpoint.
 * @constant {string}
 */
export const COUNTRIES_API = 'https://restcountries.com/v3.1/all';

/**
 * Directory for storing localization files.
 * @constant {string}
 */
export const COUNTRIES_FILE_PATH = 'data/countries/countries_data.json';


/**
 * URL for country boundaries in GeoJSON format.
 * @constant {string}
 */
export const GEOCOUNTRIES_URL =
  'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

/**
 * Directory for storing polygon data files.
 * @constant {string}
 */
export const POLYGON_FILE_PATH = 'data/polygon/countryPolygons.json';


/**
 * Language-specific search keywords for news.
 * Maps language names to their corresponding search keywords.
 * @constant {Record<string, string>}
 */
export const NEWS_KEYWORDS_BY_CODE: Record<string, string> = {
  af: 'nuus', // Afrikaans
  sq: 'lajme', // Albanian
  am: 'ዜና', // Amharic
  ar: 'أخبار', // Arabic
  arc: 'Ṭebbē', // Aramaic - Limited search engine support likely
  hy: 'նորություններ', // Armenian
  ay: 'yatiyäwinaka', // Aymara - Limited search engine support likely
  az: 'xəbərlər', // Azerbaijani
  eu: 'berriak', // Basque
  be: 'навіны', // Belarusian
  bzj: 'nyooz', // Belizean Creole - Limited search engine support likely
  bn: 'সংবাদ', // Bengali
  ber: 'Inɣmisen', // Berber - Limited search engine support likely
  bi: 'nius', // Bislama - Limited search engine support likely
  bs: 'vijesti', // Bosnian
  br: 'Keleier', // Breton - Limited search engine support likely
  bg: 'новини', // Bulgarian
  my: 'သတင်း', // Burmese
  cal: 'ráán annim', // Carolinian - Limited search engine support likely
  ca: 'notícies', // Catalan
  ch: 'notisia', // Chamorro - Limited search engine support likely
  ny: 'nkhani', // Chewa
  zh: '新闻', // Chinese
  zdj: 'habari', // Comorian - Primarily uses Swahili script/terms in search
  rar: 'rongō', // Cook Islands Māori - Limited search engine support likely
  hr: 'vijesti', // Croatian
  cs: 'zprávy', // Czech
  da: 'nyheder', // Danish
  prs: 'اخبار', // Dari Persian - Often falls under Persian search results
  dv: 'ޚަބަރު', // Maldivian
  nl: 'nieuws', // Dutch
  dz: 'གནས་ཚུལ།', // Dzongkha
  en: 'news', // English
  et: 'uudised', // Estonian
  fo: 'tíðindi', // Faroese
  fj: 'i tukutuku', // Fijian
  hif: 'khabar', // Fiji Hindi - Limited search engine support likely
  fil: 'balita', // Filipino - Tagalog is often used interchangeably
  fi: 'uutiset', // Finnish
  fr: 'nouvelles', // French
  gl: 'novas', // Galician
  ka: 'სიახლეები', // Georgian
  de: 'nachrichten', // German
  gil: 'rongorongo', // Gilbertese - Limited search engine support likely
  el: 'ειδήσεις', // Greek
  kl: 'nutârat', // Greenlandic - Limited search engine support likely
  gn: 'marandu', // Guaraní - Limited search engine support likely
  ht: 'nouvèl', // Haitian Creole
  mey: 'Leḥbara', // Hassaniya Arabic - Often falls under Arabic search results
  he: 'חדשות', // Hebrew
  hz: 'omahungu', // Herero - Limited search engine support likely
  hi: 'समाचार', // Hindi
  ho: 'rongorongo', // Hiri Motu - Limited search engine support likely
  hu: 'hírek', // Hungarian
  is: 'fréttir', // Icelandic
  id: 'berita', // Indonesian
  ga: 'nuacht', // Irish
  it: 'notizie', // Italian
  jam: 'nyuuz', // Jamaican Patois - Limited search engine support likely
  ja: 'ニュース', // Japanese
  kck: 'nhau', // Kalanga - Limited search engine support likely
  kk: 'жаңалықтар', // Kazakh
  km: 'ព័ត៌មាន', // Khmer
  naq: 'khabari', // Khoekhoe - Limited search engine support likely
  kg: 'nsangu', // Kikongo - Limited search engine support likely
  rw: 'amakuru', // Kinyarwanda
  rn: 'amakuru', // Kirundi
  ko: '뉴스', // Korean
  kwn: 'makongoero', // Kwangali - Limited search engine support likely
  ky: 'жаңылыктар', // Kyrgyz
  lo: 'ຂ່າວ', // Lao
  la: 'nuntii', // Latin - Primarily academic/historical context
  lv: 'ziņas', // Latvian
  ln: 'nsango', // Lingala
  lt: 'naujienos', // Lithuanian
  loz: 'makande', // Lozi - Limited search engine support likely
  lb: 'noriicht', // Luxembourgish
  mk: 'вести', // Macedonian
  mg: 'vaovao', // Malagasy
  ms: 'berita', // Malay
  mt: 'aħbarijiet', // Maltese
  gv: 'naight', // Manx - Limited search engine support likely
  mi: 'rongo', // Māori
  mh: 'en̄jake', // Marshallese - Limited search engine support likely
  mfe: 'nouvel', // Mauritian Creole - Limited search engine support likely
  mn: 'мэдээ', // Mongolian
  cnr: 'vijesti', // Montenegrin - Often falls under Serbian/Bosnian/Croatian
  na: 'innen', // Nauru - Limited search engine support likely
  ndc: 'nhau', // Ndau - Limited search engine support likely
  ng: 'onghundana', // Ndonga - Limited search engine support likely
  ne: 'समाचार', // Nepali
  niu: 'tala', // Niuean - Limited search engine support likely
  nrf: 'nouvelles', // Norman - Includes Jèrriais, Guernésiais. Limited search engine support likely
  nde: 'indaba', // Northern Ndebele
  se: 'ođđasat', // Northern Sami - Represents the most common Sami variant in search
  nso: 'ditaba', // Northern Sotho
  no: 'nyheter', // Norwegian - Covers Bokmål and Nynorsk
  nb: 'nyheter', // Norwegian Bokmål
  nn: 'nyhende', // Norwegian Nynorsk - Often falls under general Norwegian search
  pau: 'cheldecheduch', // Palauan - Limited search engine support likely
  pap: 'notisia', // Papiamento
  ps: 'خبرونه', // Pashto
  fa: 'اخبار', // Persian - Covers Farsi
  pih: 'nius', // Pitcairn-Norfolk - Limited search engine support likely (covers Norfuk)
  pl: 'wiadomości', // Polish
  pt: 'notícias', // Portuguese
  qu: 'willakuykuna', // Quechua - Limited search engine support likely
  ro: 'știri', // Romanian
  rm: 'novitads', // Romansh - Limited search engine support likely
  ru: 'новости', // Russian
  sm: 'tala', // Samoan
  sg: 'tène', // Sango - Limited search engine support likely
  seh: 'nhau', // Sena - Covers Chibarwe
  sr: 'вести', // Serbian - Cyrllic script, Latin 'vesti' also used
  crs: 'nouvel', // Seychellois Creole - Limited search engine support likely
  sn: 'nhau', // Shona
  si: 'පුවත්', // Sinhala
  sk: 'správy', // Slovak
  sl: 'novice', // Slovene
  so: 'wararka', // Somali
  ckb: 'هەواڵ', // Sorani - Central Kurdish
  nr: 'iindaba', // Southern Ndebele
  st: 'litaba', // Southern Sotho - Also referred to as Sotho/Sesotho
  es: 'noticias', // Spanish
  sw: 'habari', // Swahili
  ss: 'tindzaba', // Swazi
  sv: 'nyheter', // Swedish
  gsw: 'Nachrichte', // Swiss German - Alemannic German, Standard German 'Nachrichten' often used in search
  tl: 'balita', // Tagalog - Often used for Filipino
  tg: 'хабарҳо', // Tajik
  ta: 'செய்திகள்', // Tamil
  tet: 'notísia', // Tetum
  th: 'ข่าว', // Thai
  ti: 'ዜና', // Tigrinya
  tpi: 'nius', // Tok Pisin
  tkl: 'tala', // Tokelauan - Limited search engine support likely
  toi: 'makani', // Tonga (Zambian) - Limited search engine support likely
  to: 'ongoongo', // Tongan
  lua: 'nsapu', // Tshiluba - Limited search engine support likely
  ts: 'mahungu', // Tsonga
  tn: 'dikgang', // Tswana
  tr: 'haber', // Turkish
  tk: 'täzelikler', // Turkmen
  tvl: 'tala', // Tuvaluan - Limited search engine support likely
  uk: 'новини', // Ukrainian
  pov: 'notísia', // Upper Guinea Creole - Limited search engine support likely
  ur: 'خبریں', // Urdu
  uz: 'yangiliklar', // Uzbek
  ve: 'maḓivha', // Venda
  vi: 'tin tức', // Vietnamese
  cy: 'newyddion', // Welsh
  xh: 'iindaba', // Xhosa
  zu: 'izindaba', // Zulu
};
