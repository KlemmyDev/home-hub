//! The shopping list: things to buy, which can be ticked off and cleared (data/shopping.json).

use serde::{Deserialize, Serialize};

const MAX_ITEMS: usize = 500;

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Item {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub done: bool,
    /// What exactly to get ("San Remo Spaghetti 500 g"), and the product's barcode if it's a particular one.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub note: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub barcode: String,
    /// Which part of the shop it's in, worked out from its name.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub aisle: String,
    /// Which shop to buy it at (a store id), or empty for anywhere.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub store: String,
    /// The pantry item it tops up, and how much of it (in the pantry item's unit).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub pantry: String,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub qty: f64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub unit: String,
    /// Put here by the pantry (it fell below its minimum), so it comes off again if the stock is put right.
    #[serde(default, skip_serializing_if = "is_false")]
    pub auto: bool,
    /// Ticking it off has already added its amount to the pantry.
    #[serde(default, skip_serializing_if = "is_false")]
    pub restocked: bool,
    /// The dinner it's for, if it came from one.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub from: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct Shopping {
    /// In the order they were added.
    #[serde(default)]
    pub items: Vec<Item>,
}

fn is_zero(n: &f64) -> bool {
    *n == 0.0
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// Where an item on the list comes from in the pantry.
#[derive(Default, Clone)]
pub struct Link {
    pub pantry: String,
    pub store: String,
    pub qty: f64,
    pub unit: String,
}

fn new_id(taken: impl Fn(&str) -> bool) -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    (0..).map(|n| format!("s{t}x{n}")).find(|id| !taken(id)).unwrap()
}

/// Which part of the shop something is in, from its name. Anything not recognised is "Other".
pub fn aisle_of(name: &str) -> &'static str {
    let n = format!(" {} ", name.to_lowercase());
    let any = |words: &[&str]| words.iter().any(|w| n.contains(w));
    // The order matters: "frozen peas" is frozen, not fruit and veg; "chicken stock" is the pantry, not meat.
    if any(&["toilet", "paper towel", "detergent", "dishwasher", "soap", "shampoo", "nappies", "wipes", "bin bag", "cleaner", "laundry", "sponge"]) { "Household" }
    else if any(&["eggplant", "sweet potato"]) { "Fruit and veg" }
    else if any(&["frozen", "ice cream", "icecream", "ice-cream", "fish fingers", "hash brown"]) { "Frozen" }
    else if any(&["stock", "sauce", "passata", "pasta", "spaghetti", "noodle", " rice", "flour", "sugar", " oil", "vinegar", "tin ", "tinned", "beans", "lentil", "chickpea", "spice", "herb", "salt", "pepper", "cereal", "oats", "honey", "jam", "peanut butter", "taco shell", "tortilla", "wrap", "curry paste", "coconut", "stir fry sauce", "gravy", "breadcrumb", "baking", "cocoa"]) { "Pantry" }
    else if any(&["milk", "cheese", "butter", "yoghurt", "yogurt", "cream", " egg", "parmesan", "feta", "mozzarella", "margarine"]) { "Dairy and eggs" }
    else if any(&["mince", "beef", "steak", "chicken", "pork", "lamb", "sausage", "bacon", " ham", "salami", "fish", "salmon", "prawn", "tuna", "mince", "schnitzel", "turkey", "chop", "ribs", "meatball"]) { "Meat and fish" }
    else if any(&["bread", "roll", "bun", "bagel", "croissant", "muffin", "pita", "naan", "sourdough", "crumpet"]) { "Bakery" }
    else if any(&["apple", "banana", "orange", "lemon", "lime", "grape", "berry", "berries", "mango", "pear", "melon", "avocado", "tomato", "onion", "garlic", "potato", "carrot", "lettuce", "spinach", "salad", "cucumber", "capsicum", "broccoli", "cauliflower", "mushroom", "zucchini", "pumpkin", "corn", "celery", "ginger", "herbs", "parsley", "coriander", "basil", "cabbage", "kale", "beetroot", "sweet potato", "peas", "leek", "shallot", "eggplant", "fruit", "veg"]) { "Fruit and veg" }
    else if any(&["juice", "soft drink", "cola", "water", "coffee", "tea ", "wine", "beer", "cordial", "soda"]) { "Drinks" }
    else if any(&["chips", "biscuit", "chocolate", "lolly", "lollies", "snack", "cracker", "popcorn", "muesli bar", "crisps"]) { "Snacks" }
    else { "Other" }
}

fn clean(name: &str) -> Result<String, &'static str> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() || name.chars().count() > 60 {
        return Err("Say what to get (up to 60 letters).");
    }
    Ok(name)
}

impl Shopping {
    /// Add something. If it's already on the list it isn't added twice; if it was ticked off, it goes back on to buy.
    pub fn add(&mut self, name: &str) -> Result<String, &'static str> {
        let name = clean(name)?;
        if let Some(i) = self.items.iter().position(|x| x.name.to_lowercase() == name.to_lowercase()) {
            let mut item = self.items.remove(i);
            if item.done {
                item.done = false;
                let id = item.id.clone();
                self.items.push(item);
                return Ok(id);
            }
            let id = item.id.clone();
            self.items.insert(i, item);
            return Ok(id);
        }
        if self.items.len() >= MAX_ITEMS {
            return Err("The list is very long. Clear some ticked items first.");
        }
        let id = new_id(|id| self.items.iter().any(|x| x.id == id));
        let aisle = aisle_of(&name).to_string();
        self.items.push(Item { id: id.clone(), name, done: false, aisle, ..Default::default() });
        Ok(id)
    }

    /// Add something that tops up a pantry item. Its shop and amount come along; asking for it twice adds the amounts.
    pub fn add_linked(&mut self, name: &str, note: &str, barcode: &str, from: &str, link: &Link) -> Result<String, &'static str> {
        let id = self.add_for(name, note, barcode, from)?;
        let item = self.items.iter_mut().find(|x| x.id == id).unwrap();
        if item.pantry.is_empty() || item.pantry == link.pantry {
            item.pantry = link.pantry.clone();
            if item.store.is_empty() {
                item.store = link.store.clone();
            }
            item.qty = ((item.qty + link.qty) * 1000.0).round() / 1000.0;
            item.unit = link.unit.clone();
        }
        Ok(id)
    }

    /// Change which shop an item is for, or how much of it.
    pub fn set_extra(&mut self, id: &str, store: Option<&str>, qty: Option<f64>) -> Result<(), &'static str> {
        let item = self.items.iter_mut().find(|x| x.id == id).ok_or("That's gone from the list already.")?;
        if let Some(s) = store {
            item.store = s.to_string();
        }
        if let Some(q) = qty {
            if !q.is_finite() || !(0.0..=100000.0).contains(&q) {
                return Err("That amount doesn't look right.");
            }
            item.qty = q;
            item.auto = false;
        }
        Ok(())
    }

    /// Tick an item off or put it back. For something that tops up a pantry item, returns the pantry item and how much its stock should change by.
    pub fn tick(&mut self, id: &str, done: bool) -> Option<(String, f64)> {
        let item = self.items.iter_mut().find(|x| x.id == id)?;
        let was = item.done;
        item.done = done;
        if item.pantry.is_empty() || item.qty <= 0.0 {
            return None;
        }
        if done && !was && !item.restocked {
            item.restocked = true;
            return Some((item.pantry.clone(), item.qty));
        }
        if !done && was && item.restocked {
            item.restocked = false;
            return Some((item.pantry.clone(), -item.qty));
        }
        None
    }

    /// Put things on the list that have fallen below their minimum in the pantry, and take them off again when the stock is put right.
    pub fn sync_restock(&mut self, p: &crate::pantry::Pantry) {
        // Things added by hand that are in the pantry take on its shop.
        for x in self.items.iter_mut().filter(|x| !x.done && x.pantry.is_empty()) {
            if let Some(it) = p.items.iter().find(|i| i.name.to_lowercase() == x.name.trim().to_lowercase()) {
                x.pantry = it.id.clone();
                if x.store.is_empty() {
                    x.store = it.store.clone();
                }
                if x.unit.is_empty() {
                    x.unit = it.unit.clone();
                }
            }
        }
        let short = if p.settings.auto_restock { p.shortfalls() } else { Vec::new() };
        for (it, buy) in &short {
            if let Some(x) = self.items.iter_mut().find(|x| x.pantry == it.id && !x.done) {
                if x.auto {
                    x.qty = *buy;
                    x.store = it.store.clone();
                    x.unit = it.unit.clone();
                } else if x.qty == 0.0 {
                    x.qty = *buy;      // added by hand with no amount: say how much tops it up
                    x.unit = it.unit.clone();
                }
            } else if let Some(x) = self.items.iter_mut().find(|x| !x.done && x.pantry.is_empty() && x.name.to_lowercase() == it.name.to_lowercase()) {
                x.pantry = it.id.clone();      // already on the list by hand: tie it to the pantry
                if x.store.is_empty() {
                    x.store = it.store.clone();
                }
            } else if self.items.len() < MAX_ITEMS {
                let id = new_id(|id| self.items.iter().any(|x| x.id == id));
                self.items.push(Item { id, name: it.name.clone(), aisle: aisle_of(&it.name).to_string(), store: it.store.clone(), pantry: it.id.clone(), qty: *buy, unit: it.unit.clone(), auto: true, ..Default::default() });
            }
        }
        self.items.retain(|x| !(x.auto && !x.done && !short.iter().any(|(it, _)| it.id == x.pantry)));
    }

    /// Add something from a dinner, with what exactly to get. If it's already on the list, what's wanted is added to its note.
    pub fn add_for(&mut self, name: &str, note: &str, barcode: &str, from: &str) -> Result<String, &'static str> {
        let id = self.add(name)?;
        let item = self.items.iter_mut().find(|x| x.id == id).unwrap();
        let note = note.trim();
        if !note.is_empty() && !item.note.contains(note) {
            item.note = if item.note.is_empty() { note.to_string() } else { format!("{} · {}", item.note, note) };
            item.note = item.note.chars().take(200).collect();
        }
        if item.barcode.is_empty() && barcode.len() <= 14 && barcode.bytes().all(|b| b.is_ascii_digit()) {
            item.barcode = barcode.to_string();
        }
        if item.from.is_empty() {
            item.from = from.trim().chars().take(40).collect();
        }
        Ok(id)
    }

    /// Tick something off (or put it back), or change what it says.
    pub fn set(&mut self, id: &str, done: Option<bool>, name: Option<&str>) -> Result<(), &'static str> {
        let name = name.map(clean).transpose()?;
        let item = self.items.iter_mut().find(|x| x.id == id).ok_or("That's gone from the list already.")?;
        if let Some(d) = done {
            item.done = d;
        }
        if let Some(n) = name {
            item.name = n;
        }
        Ok(())
    }

    pub fn remove(&mut self, id: &str) -> Result<(), &'static str> {
        let before = self.items.len();
        self.items.retain(|x| x.id != id);
        if self.items.len() == before { Err("That's gone from the list already.") } else { Ok(()) }
    }

    /// Take every ticked item off the list.
    pub fn clear_done(&mut self) {
        self.items.retain(|x| !x.done);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn low_stock_goes_on_the_list_by_itself_and_ticking_it_off_restocks() {
        use crate::pantry::{Item as P, Pantry};
        let mut p = Pantry::default();
        let id = p.save_item(P { name: "Flour".into(), qty: 0.2, unit: "kg".into(), min: 0.5, want: 2.0, ..Default::default() }).unwrap();
        let mut l = Shopping::default();
        l.sync_restock(&p);
        assert_eq!((l.items.len(), l.items[0].qty, l.items[0].auto, l.items[0].pantry.as_str()), (1, 1.8, true, id.as_str()));
        l.sync_restock(&p);
        assert_eq!(l.items.len(), 1, "once is enough");
        let item = l.items[0].id.clone();
        let effect = l.tick(&item, true).unwrap();
        assert_eq!(effect, (id.clone(), 1.8));
        assert!(l.tick(&item, true).is_none(), "ticked twice adds nothing more");
        p.adjust(&id, Some(1.8), None).unwrap();
        l.sync_restock(&p);
        assert_eq!(l.items.len(), 1, "a ticked item stays until it is cleared");
        assert_eq!(l.tick(&item, false).unwrap(), (id.clone(), -1.8), "un-ticking takes it back off");
        p.adjust(&id, None, Some(5.0)).unwrap();
        l.sync_restock(&p);
        assert!(l.items.is_empty(), "an automatic item goes when the stock is topped up another way");
        p.settings.auto_restock = false;
        p.adjust(&id, None, Some(0.0)).unwrap();
        l.sync_restock(&p);
        assert!(l.items.is_empty(), "nothing is added when it's switched off");
    }

    #[test]
    fn things_are_sorted_into_the_parts_of_the_shop() {
        for (name, aisle) in [("Frozen peas", "Frozen"), ("Chicken stock", "Pantry"), ("Beef mince", "Meat and fish"), ("Spaghetti", "Pantry"), ("Cheddar cheese", "Dairy and eggs"), ("Sourdough bread", "Bakery"), ("Brown onion", "Fruit and veg"), ("Toilet paper", "Household"), ("Whatsit", "Other")] {
            assert_eq!(aisle_of(name), aisle, "{name}");
        }
    }

    #[test]
    fn items_are_added_ticked_and_cleared() {
        let mut s = Shopping::default();
        let milk = s.add("  Milk ").unwrap();
        let eggs = s.add("Eggs").unwrap();
        s.set(&milk, Some(true), None).unwrap();
        assert!(s.items[0].done && !s.items[1].done);
        s.clear_done();
        assert_eq!(s.items.len(), 1);
        assert_eq!(s.items[0].id, eggs);
        s.set(&eggs, None, Some("Free range eggs")).unwrap();
        assert_eq!(s.items[0].name, "Free range eggs");
        s.remove(&eggs).unwrap();
        assert!(s.items.is_empty() && s.remove(&eggs).is_err());
    }

    #[test]
    fn the_same_thing_is_not_added_twice() {
        let mut s = Shopping::default();
        let a = s.add("Bread").unwrap();
        assert_eq!(s.add("bread").unwrap(), a);
        assert_eq!(s.items.len(), 1);
        s.set(&a, Some(true), None).unwrap();
        s.add("Butter").unwrap();
        assert_eq!(s.add("BREAD").unwrap(), a, "ticked items come back");
        assert!(!s.items.iter().find(|x| x.id == a).unwrap().done);
        assert_eq!(s.items.len(), 2);
    }

    #[test]
    fn bad_names_are_turned_away() {
        let mut s = Shopping::default();
        assert!(s.add("   ").is_err());
        assert!(s.add(&"x".repeat(61)).is_err());
        let id = s.add("Rice").unwrap();
        assert!(s.set(&id, None, Some("")).is_err());
        assert!(s.set("nope", Some(true), None).is_err());
    }
}
