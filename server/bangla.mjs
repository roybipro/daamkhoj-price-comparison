/* Searches typed in Bangla. The shops list their products in English, so "আইফোন ১৫" has to become
   "iphone 15" before it can find anything. Bangla spells a borrowed name several ways (স্যামসাং and
   সামসাং, শাওমি and শাওমী, অ্যাপল and এপল), so words are compared by a rough skeleton that ignores
   those differences. Words that only ask about price ("দাম কত") are dropped, Bangla digits become
   digits, and a word still being typed can match the start of a known one. */

/* English as the shops write it, then the Bangla spellings people type for it. */
const WORDS = [
  /* Brands */
  ['apple', 'অ্যাপল', 'এপল', 'আপেল', 'অ্যাপেল'],
  ['samsung', 'স্যামসাং', 'সামসাং', 'স্যামসান', 'সামসুং'],
  ['xiaomi', 'শাওমি', 'শাওমী', 'সাওমি', 'শিয়াওমি', 'জিয়াওমি', 'শাওমির'],
  ['redmi', 'রেডমি', 'রেডমী'],
  ['poco', 'পোকো'],
  ['realme', 'রিয়েলমি', 'রিয়েলমী', 'রিয়ালমি'],
  ['oneplus', 'ওয়ানপ্লাস', 'ওয়ান প্লাস'],
  ['vivo', 'ভিভো'],
  ['oppo', 'অপো', 'অপ্পো'],
  ['huawei', 'হুয়াওয়ে', 'হুয়াই', 'হুয়াওয়েই'],
  ['honor', 'অনার', 'হনর'],
  ['nokia', 'নোকিয়া'],
  ['motorola', 'মটোরোলা', 'মোটোরোলা'],
  ['infinix', 'ইনফিনিক্স'],
  ['tecno', 'টেকনো'],
  ['google', 'গুগল'],
  ['pixel', 'পিক্সেল'],
  ['nothing', 'নাথিং'],
  ['walton', 'ওয়ালটন'],
  ['symphony', 'সিম্ফনি', 'সিমফোনি'],
  ['sony', 'সনি'],
  ['jbl', 'জেবিএল'],
  ['anker', 'অ্যাঙ্কার', 'অ্যাংকার', 'এংকার', 'আঙ্কার'],
  ['baseus', 'বেসিয়াস', 'বেসাস'],
  ['ugreen', 'ইউগ্রিন'],
  ['oraimo', 'ওরাইমো'],
  ['hoco', 'হোকো'],
  ['qcy', 'কিউসিওয়াই'],
  ['edifier', 'এডিফায়ার'],
  ['haylou', 'হাইলু', 'হেইলু'],
  ['amazfit', 'অ্যামাজফিট', 'আমাজফিট'],
  ['casio', 'ক্যাসিও', 'কাসিও'],
  ['titan', 'টাইটান'],
  ['fastrack', 'ফাস্টট্র্যাক', 'ফাস্ট্রাক'],
  ['asus', 'আসুস', 'এসুস'],
  ['lenovo', 'লেনোভো'],
  ['hp', 'এইচপি'],
  ['dell', 'ডেল'],
  ['acer', 'এসার', 'অ্যাসার'],
  ['msi', 'এমএসআই'],
  ['lg', 'এলজি'],
  ['philips', 'ফিলিপস'],
  ['panasonic', 'প্যানাসনিক'],
  ['logitech', 'লজিটেক'],
  ['dji', 'ডিজেআই'],
  ['canon', 'ক্যানন'],
  ['nikon', 'নিকন'],
  ['gopro', 'গোপ্রো'],
  ['tp-link', 'টিপি-লিংক', 'টিপিলিংক'],
  ['playstation', 'প্লেস্টেশন'],
  ['xbox', 'এক্সবক্স'],
  /* Product lines */
  ['iphone', 'আইফোন', 'আই ফোন'],
  ['ipad', 'আইপ্যাড', 'আইপেড'],
  ['macbook', 'ম্যাকবুক', 'মেকবুক'],
  ['imac', 'আইম্যাক'],
  ['airpods', 'এয়ারপডস', 'এয়ারপড', 'এয়ার পডস'],
  ['galaxy', 'গ্যালাক্সি', 'গ্যালাক্সী', 'গেলাক্সি'],
  ['note', 'নোট'],
  ['pro', 'প্রো'],
  ['max', 'ম্যাক্স', 'মাক্স'],
  ['ultra', 'আল্ট্রা'],
  ['plus', 'প্লাস'],
  ['mini', 'মিনি'],
  ['air', 'এয়ার'],
  ['lite', 'লাইট'],
  ['fold', 'ফোল্ড'],
  ['flip', 'ফ্লিপ'],
  ['series', 'সিরিজ'],
  ['se', 'এসই'],
  /* Kinds of product */
  ['phone', 'ফোন', 'মোবাইল', 'মোবাইল ফোন'],
  ['smartphone', 'স্মার্টফোন'],
  ['laptop', 'ল্যাপটপ', 'লেপটপ'],
  ['tablet', 'ট্যাবলেট'],
  ['tab', 'ট্যাব'],
  ['watch', 'ওয়াচ', 'ঘড়ি'],
  ['smartwatch', 'স্মার্টওয়াচ'],
  ['smart', 'স্মার্ট'],
  ['band', 'ব্যান্ড'],
  ['charger', 'চার্জার'],
  ['adapter', 'অ্যাডাপ্টার', 'এডাপ্টার'],
  ['cable', 'ক্যাবল', 'কেবল'],
  ['power', 'পাওয়ার'],
  ['bank', 'ব্যাংক'],
  ['power bank', 'পাওয়ারব্যাংক'],
  ['headphones', 'হেডফোন'],
  ['earphones', 'ইয়ারফোন'],
  ['earbuds', 'ইয়ারবাডস', 'ইয়ারবাড'],
  ['buds', 'বাডস'],
  ['speaker', 'স্পিকার'],
  ['neckband', 'নেকব্যান্ড'],
  ['monitor', 'মনিটর'],
  ['tv', 'টিভি', 'টেলিভিশন'],
  ['camera', 'ক্যামেরা'],
  ['keyboard', 'কিবোর্ড', 'কীবোর্ড'],
  ['mouse', 'মাউস'],
  ['router', 'রাউটার'],
  ['printer', 'প্রিন্টার'],
  ['ssd', 'এসএসডি'],
  ['ram', 'র\u200d্যাম', 'রেম', 'রাম'],
  ['cover', 'কভার'],
  ['case', 'কেস'],
  ['protector', 'প্রটেক্টর'],
  ['wireless', 'ওয়্যারলেস', 'ওয়ারলেস'],
  ['gaming', 'গেমিং']
];

/* Known but never guessed from a half-typed word, which would turn "সা…" (on the way to
   স্যামসাং) into "white". */
const OTHER_WORDS = [
  /* Colours */
  ['black', 'কালো'],
  ['white', 'সাদা'],
  ['blue', 'নীল'],
  ['red', 'লাল'],
  ['green', 'সবুজ'],
  ['gold', 'সোনালী', 'গোল্ড'],
  ['silver', 'রুপালি', 'সিলভার'],
  ['pink', 'গোলাপি'],
  ['purple', 'বেগুনি'],
  /* Words that only ask about price or place: dropped */
  ['', 'দাম', 'দামে', 'দাম কত', 'কত', 'প্রাইস', 'মূল্য', 'এর', 'এ', 'কেমন', 'বাংলাদেশ', 'বাংলাদেশে', 'বিডি', 'নতুন', 'অরিজিনাল', 'অফিসিয়াল', 'সবচেয়ে', 'কম', 'কোথায়', 'কিনুন', 'কিনতে', 'চাই']
];

/* Sizes after a number: "১২৮ জিবি" → "128gb". */
const UNITS = [
  ['gb', 'জিবি'], ['tb', 'টিবি'], ['mah', 'এমএএইচ', 'মিলিঅ্যাম্পিয়ার'], ['w', 'ওয়াট', 'ওয়াটের'],
  ['mm', 'মিমি'], ['inch', 'ইঞ্চি', 'ইঞ্চির'], ['hz', 'হার্জ'],
  /* "৫জি" is a 5G phone and "৪কে" a 4K screen: the letter's name right after a number. */
  ['g', 'জি'], ['k', 'কে'],
  ['kg', 'কেজি', 'কিলো'], ['g', 'গ্রাম'], ['l', 'লিটার'], ['ml', 'মিলি', 'এমএল']
];

/* English letters as Bangla says them, for model codes: "এ১৬" → "a16", "এস ২৪" → "s24". */
const LETTERS = [
  ['a', 'এ'], ['b', 'বি'], ['c', 'সি'], ['d', 'ডি'], ['e', 'ই'], ['f', 'এফ'], ['g', 'জি'], ['h', 'এইচ'],
  ['i', 'আই'], ['j', 'জে'], ['k', 'কে'], ['l', 'এল'], ['m', 'এম'], ['n', 'এন'], ['o', 'ও'], ['p', 'পি'],
  ['q', 'কিউ'], ['r', 'আর'], ['s', 'এস'], ['t', 'টি'], ['u', 'ইউ'], ['v', 'ভি'], ['w', 'ডব্লিউ'],
  ['x', 'এক্স'], ['y', 'ওয়াই'], ['z', 'জেড']
];

const BANGLA = /[\u0980-\u09ff]/;
export const hasBangla = text => BANGLA.test(String(text ?? ''));

/**
 * A rough shape of a Bangla word, the same for the ways people spell one name: no joiners,
 * chandrabindu, nukta or hasant; ya-phala gone (স্যামসাং = সামসাং); long and short vowel signs alike
 * (শাওমী = শাওমি); শ, ষ and স alike; ণ = ন; ঙ = ং; অ্যা at the start = এ (অ্যাপল = এপল).
 */
export function skeleton(word) {
  return String(word).normalize('NFC')
    .replace(/[\u200c\u200d\u0981\u09bc]/g, '')
    .replace(/\u09cd\u09af/g, '')
    .replace(/\u09cd/g, '')
    .replace(/^\u0985\u09be/, '\u098f')
    .replace(/\u09c0/g, '\u09bf')
    .replace(/\u09c2/g, '\u09c1')
    .replace(/[\u09b6\u09b7]/g, '\u09b8')
    .replace(/\u09a3/g, '\u09a8')
    .replace(/\u0999/g, '\u0982')
    .replace(/\u09ce/g, '\u09a4');
}

const lookup = list => {
  const map = new Map();
  for (const [english, ...spellings] of list) {
    for (const spelling of spellings) {
      /* A spelling of two words ("দাম কত") is also known as one ("দামকত"). */
      map.set(skeleton(spelling.replace(/\s+/g, '')), english);
    }
  }
  return map;
};
const KNOWN = lookup([...WORDS, ...OTHER_WORDS]);
const COMPLETABLE = lookup(WORDS);
const UNIT_OF = lookup(UNITS);
const LETTER_OF = lookup(LETTERS);
const DIGITS = '০১২৩৪৫৬৭৮৯';

/** The name a half-typed Bangla word starts, the shortest first ("স্যাম" → "samsung"). */
function completion(start) {
  let best = null;
  for (const [shape, english] of COMPLETABLE) {
    if (english && shape.startsWith(start) && (!best || shape.length < best[0].length)) best = [shape, english];
  }
  return best?.[1];
}

/**
 * The query in the shops' English: Bangla words that are known are replaced, Bangla digits become
 * digits, a size after a number joins it ("১২৮ জিবি" → "128gb"), and price-asking words go. Words
 * it does not know are left as typed. With `partial`, a half-typed last word may be completed.
 * Text with no Bangla comes back unchanged.
 */
export function fromBangla(text, { partial = false } = {}) {
  const typed = String(text ?? '');
  if (!hasBangla(typed)) return typed;
  const words = typed.normalize('NFC').replace(/[\u09e6-\u09ef]/g, digit => String(DIGITS.indexOf(digit))).split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!hasBangla(word)) {
      out.push(word);
      continue;
    }
    /* A number with its size in Bangla, together ("১২৮জিবি") or as the next word ("১২৮ জিবি"). */
    const glued = word.match(/^(\d+(?:\.\d+)?)(\D+)$/);
    if (glued && UNIT_OF.has(skeleton(glued[2]))) {
      out.push(glued[1] + UNIT_OF.get(skeleton(glued[2])));
      continue;
    }
    if (UNIT_OF.has(skeleton(word)) && /^\d+(\.\d+)?$/.test(out.at(-1) ?? '')) {
      out.push(out.pop() + UNIT_OF.get(skeleton(word)));
      continue;
    }
    /* A model code: a letter's name and a number, together ("এ16") or apart ("এ 16"), maybe a
       letter after it ("এম4এস"). */
    const code = word.match(/^(\D+?)(\d+)(\D*)$/);
    if (code && LETTER_OF.has(skeleton(code[1])) && (!code[3] || LETTER_OF.has(skeleton(code[3])))) {
      out.push(LETTER_OF.get(skeleton(code[1])) + code[2] + (code[3] ? LETTER_OF.get(skeleton(code[3])) : ''));
      continue;
    }
    if (LETTER_OF.has(skeleton(word)) && /^\d+$/.test(words[i + 1] ?? '')) {
      out.push(LETTER_OF.get(skeleton(word)) + words[i + 1]);
      i++;
      continue;
    }
    /* Two words people write apart that are known together ("পাওয়ার ব্যাংক", "দাম কত"). */
    const pair = i + 1 < words.length ? skeleton(word + words[i + 1]) : null;
    if (pair && KNOWN.has(pair)) {
      out.push(KNOWN.get(pair));
      i++;
      continue;
    }
    const shape = skeleton(word);
    if (KNOWN.has(shape)) {
      out.push(KNOWN.get(shape));
      continue;
    }
    const last = i === words.length - 1;
    const guess = partial && last && [...shape].length >= 3 ? completion(shape) : undefined;
    out.push(guess ?? word);
  }
  return out.filter(Boolean).join(' ');
}
