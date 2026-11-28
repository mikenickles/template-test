import { addDays, dateKey, today } from './dates';

export type Where = 'fridge' | 'freezer' | 'pantry';
export type PersonId = 'D' | 'M' | 'K' | 'F';
export type StoreId = 'costco' | 'tj' | 'target' | 'safeway';

export interface StockItem { id: string; name: string; qty: number; unit: string; low: number; note: string; where: Where; }
export interface Grocery { id: string; name: string; qty: string; store: StoreId; got: boolean; }
export interface Task { id: string; who: PersonId; title: string; due: string; done: boolean; }
export interface CalEvent { id: string; date: string; title: string; start: string; end: string; who: PersonId; }

export const PEOPLE: Record<PersonId, { name: string; dot: string; tint: string; text: string }> = {
  D: { name: 'Dad', dot: '#4F5BD5', tint: '#EEF0FB', text: '#2F3E9E' },
  M: { name: 'Mom', dot: '#8B5CF6', tint: '#F4EEFD', text: '#5B2E9E' },
  K: { name: 'Kid', dot: '#E8703A', tint: '#FFF0E7', text: '#8E3A10' },
  F: { name: 'Family', dot: '#2F9E5B', tint: '#E9F5EE', text: '#1F6A42' }
};
export const PERSON_IDS: PersonId[] = ['D', 'M', 'K', 'F'];

export const STORES: Record<StoreId, { name: string; dot: string; tint: string; text: string }> = {
  costco: { name: 'Costco', dot: '#3E7CB1', tint: '#EAF2F9', text: '#25557E' },
  tj: { name: "Trader Joe's", dot: '#C8553D', tint: '#FBEDE9', text: '#8C3523' },
  target: { name: 'Target', dot: '#D6336C', tint: '#FCEBF1', text: '#9A1E4B' },
  safeway: { name: 'Safeway', dot: '#2F9E5B', tint: '#E9F5EE', text: '#1F6A42' }
};
export const STORE_IDS: StoreId[] = ['costco', 'tj', 'target', 'safeway'];

export const WHERE_LABEL: Record<Where, string> = { fridge: 'Fridge', freezer: 'Freezer', pantry: 'Pantry' };

let counter = 0;
export const uid = (p = 'x') => p + Date.now().toString(36) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Categorizing stock ---------- */
const RULES: [string, Where, string[]][] = [
  ['Frozen', 'freezer', ['frozen', 'ice cream', 'waffle', 'popsicle', 'ice pop', 'pizza rolls', 'nuggets', 'pizza', 'burrito', 'french fries', 'garlic bread', 'ice']],
  ['Canned & jarred', 'pantry', ['canned', 'soup', 'beans', 'tuna']],
  ['Snacks', 'pantry', ['chip', 'cracker', 'cookie', 'granola', 'popcorn', 'pretzel', 'nut', 'candy', 'peanut butter']],
  ['Dairy & eggs', 'fridge', ['milk', 'egg', 'yogurt', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'butter', 'cream', 'sour cream']],
  ['Meat & seafood', 'fridge', ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'ham', 'salmon', 'shrimp', 'fish', 'steak']],
  ['Produce', 'pantry', ['banana', 'potato', 'onion', 'garlic', 'avocado', 'tomato']],
  ['Produce', 'fridge', ['spinach', 'lettuce', 'berr', 'strawberr', 'apple', 'grape', 'carrot', 'pepper', 'broccoli', 'cucumber', 'lemon', 'lime', 'pea', 'kale', 'celery', 'corn', 'mango', 'green onion']],
  ['Drinks', 'fridge', ['juice', 'soda', 'water', 'kombucha', 'beer', 'wine', 'lemonade']],
  ['Sauces & condiments', 'fridge', ['salsa', 'ketchup', 'mustard', 'mayo', 'dressing', 'sauce', 'jam', 'hummus']],
  ['Bread & grains', 'pantry', ['bread', 'tortilla', 'rice', 'pasta', 'cereal', 'oat', 'flour', 'bagel', 'quinoa', 'noodle']],
  ['Coffee & tea', 'pantry', ['coffee', 'tea']],
  ['Baking & spices', 'pantry', ['sugar', 'salt', 'spice', 'baking', 'vanilla', 'cinnamon', 'oil']]
];

export function categorize(name: string): { category: string; where: Where | null } {
  const n = name.toLowerCase();
  const hit = RULES.find((r) => r[2].some((w) => new RegExp('\\b' + w).test(n)));
  return hit ? { category: hit[0], where: hit[1] } : { category: 'Other', where: null };
}

export function categoryFor(item: StockItem) {
  let c = categorize(item.where === 'freezer' ? item.name.replace(/^frozen /i, '') : item.name).category;
  if (c === 'Frozen') c = 'Meals & treats';
  return c;
}

export const CATEGORY_ORDER = ['Produce', 'Dairy & eggs', 'Meat & seafood', 'Meals & treats', 'Drinks', 'Sauces & condiments', 'Bread & grains', 'Snacks', 'Coffee & tea', 'Canned & jarred', 'Baking & spices', 'Other'];

/* ---------- Seeds ---------- */
function seedStock(): StockItem[] {
  let n = 0;
  const mk = (where: Where) => (name: string, qty: number, unit: string, low: number, note = ''): StockItem => ({ id: 'st' + n++, name, qty, unit, low, note, where });
  const f = mk('fridge'), z = mk('freezer'), p = mk('pantry');
  return [
    f('Milk', 1, 'gal', 1, 'Opened Mon'), f('Eggs', 8, '', 4, 'Best by next week'), f('Greek yogurt', 3, 'cups', 1, 'Use by Sat'),
    f('Cheddar', 1, 'block', 0, 'Opened last week'), f('Mozzarella', 1, 'bag', 0, 'Shredded'), f('Butter', 2, 'sticks', 1),
    f('Sour cream', 1, 'tub', 0), f('Coffee creamer', 1, 'bottle', 0, 'Vanilla'), f('Chicken thighs', 2, 'lb', 0, 'Use by Sun'),
    f('Bacon', 1, 'pack', 0), f('Turkey slices', 1, 'pack', 0, 'Deli'), f('Spinach', 1, 'bag', 0, 'Use by tomorrow'),
    f('Strawberries', 1, 'box', 0), f('Apples', 6, '', 2, 'Honeycrisp'), f('Carrots', 1, 'bag', 0, 'Baby carrots'),
    f('Bell peppers', 3, '', 1), f('Lettuce', 1, 'head', 0, 'Romaine'), f('Lemons', 4, '', 1), f('Orange juice', 1, 'bottle', 0, 'Half left'),
    f('Sparkling water', 8, 'cans', 4), f('Salsa', 1, 'jar', 0, 'Opened Tue'), f('Ketchup', 1, 'bottle', 0), f('Ranch dressing', 1, 'bottle', 0), f('Hummus', 1, 'tub', 0),
    z('Frozen peas', 2, 'bags', 0), z('Frozen broccoli', 1, 'bag', 0), z('Frozen corn', 1, 'bag', 0), z('Berries', 2, 'bags', 0, 'For smoothies'),
    z('Frozen mango', 1, 'bag', 0, 'For smoothies'), z('Ground beef', 3, 'lb', 1, 'Frozen 2 weeks ago'), z('Chicken breasts', 4, 'lb', 1),
    z('Salmon fillets', 4, '', 0), z('Shrimp', 1, 'bag', 0, 'Peeled'), z('Breakfast sausage', 1, 'box', 0), z('Chicken nuggets', 1, 'bag', 0),
    z('Frozen pizza', 2, '', 1, 'Pepperoni'), z('Waffles', 1, 'box', 1), z('Pizza rolls', 1, 'bag', 0), z('Burritos', 6, '', 2, 'Bean & cheese'),
    z('Ice cream', 1, 'pint', 0, 'Vanilla'), z('Popsicles', 8, '', 2), z('Frozen bagels', 6, '', 0), z('Garlic bread', 1, 'loaf', 0),
    z('Ice', 1, 'bag', 0), z('Frozen french fries', 1, 'bag', 0),
    p('Bananas', 5, '', 3), p('Potatoes', 1, 'bag', 0, 'Russet'), p('Onions', 3, '', 1), p('Garlic', 1, 'bulb', 0), p('Bread', 1, 'loaf', 1, 'Half loaf'),
    p('Tortillas', 12, '', 4), p('Rice', 1, 'bag', 0, '5 lb bag'), p('Pasta', 3, 'boxes', 1), p('Cereal', 2, 'boxes', 1), p('Oatmeal', 1, 'canister', 0),
    p('Peanut butter', 1, 'jar', 0), p('Tortilla chips', 1, 'bag', 0), p('Crackers', 2, 'boxes', 0), p('Granola bars', 10, '', 4), p('Popcorn', 6, 'bags', 2),
    p('Coffee', 1, 'bag', 1, 'Almost out'), p('Green tea', 1, 'box', 0), p('Black beans', 4, 'cans', 1), p('Tomato soup', 3, 'cans', 1), p('Tuna', 3, 'cans', 1),
    p('Pasta sauce', 2, 'jars', 1, 'Marinara'), p('Olive oil', 1, 'bottle', 0), p('Flour', 1, 'bag', 0), p('Sugar', 1, 'bag', 0)
  ];
}

function seedGroceries(): Grocery[] {
  let n = 0;
  const i = (name: string, qty: string, store: StoreId, got = false): Grocery => ({ id: 'g' + n++, name, qty, store, got });
  return [
    i('Paper towels', '1 pack', 'costco'), i('Coffee beans', '2 bags', 'costco'), i('Chicken breasts', '6 lb', 'costco'),
    i('Sparkling water', '24 cans', 'costco', true), i('Olive oil', '1', 'costco'),
    i('Frozen mango', '2 bags', 'tj'), i('Hummus', '1', 'tj'), i('Mandarin orange chicken', '1', 'tj'), i('Flowers', '1 bunch', 'tj', true),
    i('Birthday card', '1', 'target'), i('Dish soap', '1', 'target'), i('Batteries AA', '1 pack', 'target'),
    i('Milk', '1 gal', 'safeway'), i('Eggs', '1 dozen', 'safeway'), i('Bananas', '1 bunch', 'safeway'), i('Avocados', '4', 'safeway', true),
    i('Yogurt', '4 cups', 'safeway'), i('Bread', '1 loaf', 'safeway')
  ];
}

function seedTasks(): Task[] {
  let n = 0;
  const t = (who: PersonId, title: string, due: string, done = false): Task => ({ id: 't' + n++, who, title, due, done });
  return [
    t('D', 'Take out recycling', 'Today', true), t('D', 'Water the plants', 'Today'), t('D', 'Fix the garage light', 'Sat'), t('D', 'Renew car registration', 'Next week'), t('D', 'Change air filter', 'Next week'),
    t('M', 'Call the plumber', 'Today'), t('M', 'Book dentist reminder', 'Today', true), t('M', 'Order birthday gift', 'Fri'), t('M', 'Sign permission slip', 'Tomorrow'), t('M', 'Plan holiday menu', 'Sun'),
    t('K', 'Empty dishwasher', 'Today', true), t('K', 'Finish homework', 'Today'), t('K', 'Practice piano · 20 min', 'Daily'), t('K', 'Feed the cat', 'Daily', true), t('K', 'Clean your room', 'Sat'), t('K', 'Read for 30 min', 'Daily'),
    t('F', 'Decorate for the holidays', 'Sun'), t('F', 'Pick a movie for Friday', 'Fri', true), t('F', 'Donate old clothes', 'This month'), t('F', 'Write thank-you cards', 'This week')
  ];
}

function seedEvents(): CalEvent[] {
  const t = today();
  let n = 0;
  const e = (offset: number, title: string, start: string, end: string, who: PersonId): CalEvent => ({ id: 'e' + n++, date: dateKey(addDays(t, offset)), title, start, end, who });
  return [
    e(-19, 'Birthday party', '13:00', '15:00', 'K'), e(-14, 'Parent-teacher conference', '15:30', '16:00', 'M'), e(-12, 'Car service', '09:00', '10:00', 'D'),
    e(-6, 'Date night', '18:30', '21:00', 'M'), e(0, 'School pickup', '15:15', '15:45', 'K'), e(1, 'Dentist appointment', '10:00', '11:00', 'M'),
    e(5, 'Haircut', '17:00', '17:45', 'D'), e(9, 'Family game night', '18:00', '19:30', 'F'), e(16, 'Neighborhood party', '19:00', '22:00', 'F')
  ];
}

/** Weekly routines: day of week (0 = Sunday). */
export const ROUTINES: { id: string; dow: number[]; title: string; start: string; end: string; who: PersonId }[] = [
  { id: 'r-swim', dow: [1], title: 'Swim lessons', start: '16:00', end: '17:00', who: 'K' },
  { id: 'r-soccer', dow: [2, 4], title: 'Soccer practice', start: '16:30', end: '18:00', who: 'K' },
  { id: 'r-book', dow: [3], title: 'Book club', start: '19:00', end: '20:30', who: 'M' },
  { id: 'r-movie', dow: [5], title: 'Movie night', start: '19:00', end: '21:00', who: 'F' },
  { id: 'r-market', dow: [6], title: 'Farmers market', start: '09:00', end: '10:30', who: 'F' },
  { id: 'r-prep', dow: [0], title: 'Meal prep', start: '15:00', end: '16:00', who: 'D' }
];

function seedPlan(): Record<string, string> {
  const t = today();
  return {
    [dateKey(t)]: 'Chicken tacos',
    [dateKey(addDays(t, 2))]: 'Spaghetti bolognese',
    [dateKey(addDays(t, 5))]: 'Shrimp fried rice'
  };
}

/* ---------- Recipes ---------- */
export interface Recipe { id: string; name: string; mins: number; serves: number; tags: string[]; ingredients: string[]; art: string[]; }

const ART = [
  ['#FFE3C4', '#FFC9A3', '#F3D9A6', '#E5533D', '#5FA35A'], ['#FFE0D6', '#FFC4B2', '#F7F0E2', '#F08A64', '#8CC56B'],
  ['#FFDCD1', '#F7B9A6', '#F2D48F', '#C9412F', '#7DBA5C'], ['#FFF0CC', '#FFDB97', '#F4E2B5', '#F08A64', '#7DBA5C'],
  ['#FFF4C8', '#FFE08A', '#F5CF5A', '#4E9A4A', '#F2F0E6'], ['#FFE6C2', '#FFCB88', '#E8A85A', '#D9442E', '#F6C25A'],
  ['#FFE3C4', '#FFC48F', '#F7CF7A', '#8B4A2B', '#5FA35A'], ['#E3F3D6', '#C5E6AE', '#F3E2BD', '#E5533D', '#3F9A4A'],
  ['#FFF0C7', '#FFD786', '#F2C766', '#3A2E2A', '#E5533D'], ['#F3E6D6', '#E4C9A8', '#D9B48A', '#F5EFD9', '#5FA35A'],
  ['#FCE1E6', '#F7BFCB', '#E9B26A', '#E5533D', '#F5D36A'], ['#FFF7CC', '#FBE68A', '#F4E4A8', '#4E9A4A', '#F6D84A'],
  ['#FFF0D6', '#F9D7A4', '#F6E2A8', '#F08A3C', '#7DBA5C'], ['#FFDCD4', '#FFB3A2', '#E8B15C', '#C9412F', '#F5E6C0'],
  ['#E8EEFC', '#CCDAF9', '#E8B76A', '#F4E6B8', '#6FA9D6'], ['#FFE6CF', '#FFC79B', '#F2B86A', '#B5452F', '#7DBA5C']
];

export const RECIPES: Recipe[] = ([
  ['Chicken burrito bowls', 30, 4, ['quick', 'kid'], ['Chicken thighs', 'Rice', 'Black beans', 'Salsa', 'Cheddar']],
  ['Lemon garlic salmon', 25, 4, ['quick', 'freezer'], ['Salmon fillets', 'Lemons', 'Garlic', 'Rice', 'Frozen broccoli']],
  ['Spaghetti bolognese', 40, 6, ['kid', 'freezer'], ['Pasta', 'Ground beef', 'Pasta sauce', 'Onions', 'Garlic', 'Parmesan']],
  ['Shrimp fried rice', 20, 4, ['quick', 'freezer'], ['Shrimp', 'Rice', 'Eggs', 'Frozen peas', 'Frozen corn']],
  ['Spinach & cheddar frittata', 25, 4, ['quick', 'veg'], ['Eggs', 'Spinach', 'Cheddar', 'Potatoes', 'Onions']],
  ['Grilled cheese & tomato soup', 15, 4, ['quick', 'kid', 'veg'], ['Bread', 'Cheddar', 'Butter', 'Tomato soup']],
  ['Beef tacos', 25, 4, ['quick', 'kid', 'freezer'], ['Ground beef', 'Tortillas', 'Cheddar', 'Lettuce', 'Salsa']],
  ['Chicken veggie stir-fry', 25, 4, ['quick', 'freezer'], ['Chicken breasts', 'Bell peppers', 'Carrots', 'Frozen broccoli', 'Rice', 'Soy sauce']],
  ['Black bean quesadillas', 15, 4, ['quick', 'kid', 'veg'], ['Tortillas', 'Black beans', 'Mozzarella', 'Salsa', 'Sour cream']],
  ['Loaded baked potatoes', 50, 4, ['kid'], ['Potatoes', 'Bacon', 'Cheddar', 'Sour cream', 'Butter', 'Green onions']],
  ['Breakfast for dinner', 20, 4, ['quick', 'kid', 'freezer'], ['Waffles', 'Eggs', 'Bacon', 'Strawberries']],
  ['Lemon spinach pasta', 20, 4, ['quick', 'veg'], ['Pasta', 'Lemons', 'Garlic', 'Spinach', 'Butter', 'Parmesan']],
  ['Chicken noodle soup', 50, 6, ['kid'], ['Chicken breasts', 'Carrots', 'Onions', 'Garlic', 'Celery', 'Egg noodles']],
  ['Pizza night', 20, 4, ['quick', 'kid', 'freezer'], ['Frozen pizza', 'Garlic bread', 'Lettuce', 'Ranch dressing']],
  ['Tuna melts', 15, 4, ['quick'], ['Tuna', 'Bread', 'Cheddar', 'Butter']],
  ['Chicken tacos', 30, 4, ['quick', 'kid'], ['Chicken thighs', 'Tortillas', 'Salsa', 'Lettuce', 'Sour cream']]
] as [string, number, number, string[], string[]][]).map(([name, mins, serves, tags, ingredients], i) => ({ id: 'r' + i, name, mins, serves, tags, ingredients, art: ART[i % ART.length] }));

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/(es|s)\b/g, '').trim();

/** True when the stock holds something matching this ingredient with qty above zero. */
export function inStock(stock: StockItem[], ingredient: string) {
  const n = norm(ingredient);
  return stock.some((s) => {
    if (s.qty <= 0) return false;
    const m = norm(s.name);
    return m === n || m.endsWith(' ' + n) || n.endsWith(' ' + m);
  });
}

export interface AppData {
  version: number;
  stock: StockItem[];
  groceries: Grocery[];
  tasks: Task[];
  events: CalEvent[];
  skipped: string[];
  plan: Record<string, string>;
}

export function seedData(): AppData {
  return { version: 1, stock: seedStock(), groceries: seedGroceries(), tasks: seedTasks(), events: seedEvents(), skipped: [], plan: seedPlan() };
}

export interface DayEvent { id: string; title: string; start: string; end: string; who: PersonId; routine: boolean; }

export function eventsOn(data: Pick<AppData, 'events' | 'skipped'>, key: string): DayEvent[] {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const list: DayEvent[] = [];
  ROUTINES.forEach((r) => {
    const id = r.id + '@' + key;
    if (r.dow.includes(dow) && !data.skipped.includes(id)) list.push({ id, title: r.title, start: r.start, end: r.end, who: r.who, routine: true });
  });
  data.events.filter((e) => e.date === key).forEach((e) => list.push({ id: e.id, title: e.title, start: e.start, end: e.end, who: e.who, routine: false }));
  return list.sort((a, b) => a.start.localeCompare(b.start));
}
