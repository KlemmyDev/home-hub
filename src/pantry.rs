//! The pantry: what the family has at home and how much (data/pantry.json), the shops they buy from, and the levels
//! they want to keep. When something runs below its minimum it goes on the shopping list by itself (see `shortfalls`).

use crate::dinners::Product;
use serde::{Deserialize, Serialize};

const MAX_ITEMS: usize = 600;
const MAX_STORES: usize = 12;

/// A shop the family buys from.
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Store {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Item {
    #[serde(default)]
    pub id: String,
    pub name: String,
    /// How much there is now, in `unit` (like 1.5 kg, 3 tins, 2 packets). 0 means it has run out.
    #[serde(default)]
    pub qty: f64,
    #[serde(default)]
    pub unit: String,
    /// The least to keep: below this it goes on the shopping list. 0 means no minimum.
    #[serde(default)]
    pub min: f64,
    /// How much to buy up to when topping up. 0 means twice the minimum.
    #[serde(default)]
    pub want: f64,
    /// Where it's usually bought (a store id), or empty for anywhere.
    #[serde(default)]
    pub store: String,
    /// Take it off the stock when a dinner using it is cooked. Off for things like herbs, which a dinner never uses up.
    #[serde(default = "yes")]
    pub auto: bool,
    #[serde(default)]
    pub product: Option<Product>,
    #[serde(default)]
    pub note: String,
    /// Which part of the shop it's in, worked out from its name when the pantry is read (never saved).
    #[serde(default, skip_deserializing)]
    pub aisle: String,
}

fn yes() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Settings {
    /// Put things on the shopping list when they fall below their minimum.
    #[serde(default = "yes")]
    pub auto_restock: bool,
    /// Show what a dinner used and let it be changed before the stock is taken off.
    #[serde(default = "yes")]
    pub ask_before_use: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { auto_restock: true, ask_before_use: true }
    }
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct Pantry {
    #[serde(default)]
    pub stores: Vec<Store>,
    #[serde(default)]
    pub items: Vec<Item>,
    #[serde(default)]
    pub settings: Settings,
}

fn new_id(prefix: &str, taken: impl Fn(&str) -> bool) -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    (0..).map(|n| format!("{prefix}{t}x{n}")).find(|id| !taken(id)).unwrap()
}

fn round(n: f64) -> f64 {
    (n * 1000.0).round() / 1000.0
}

fn ok_number(n: f64) -> bool {
    n.is_finite() && (0.0..=100000.0).contains(&n)
}

impl Item {
    /// Below its minimum (when it has one).
    pub fn is_low(&self) -> bool {
        self.min > 0.0 && self.qty < self.min
    }

    /// How much to buy to top it up.
    pub fn to_buy(&self) -> f64 {
        let up_to = if self.want > 0.0 { self.want } else { self.min * 2.0 };
        round((up_to - self.qty).max(0.0)).max(if up_to > 0.0 { 0.001 } else { 0.0 })
    }
}

impl Pantry {
    /// Add an item, or change the one with this id. Returns its id.
    pub fn save_item(&mut self, mut item: Item) -> Result<String, &'static str> {
        item.name = item.name.split_whitespace().collect::<Vec<_>>().join(" ");
        item.unit = item.unit.trim().to_string();
        item.note = item.note.trim().to_string();
        if item.name.is_empty() || item.name.chars().count() > 50 {
            return Err("Give it a name (up to 50 letters).");
        }
        if item.unit.chars().count() > 12 || item.note.chars().count() > 120 {
            return Err("The unit or note is too long.");
        }
        if ![item.qty, item.min, item.want].iter().all(|n| ok_number(*n)) {
            return Err("Those amounts don't look right.");
        }
        if !item.store.is_empty() && !self.stores.iter().any(|s| s.id == item.store) {
            return Err("That shop has gone.");
        }
        if let Some(p) = &item.product {
            if p.code.len() > 14 || !p.code.bytes().all(|b| b.is_ascii_digit()) || p.name.chars().count() > 120 || p.brand.chars().count() > 80 || p.quantity.chars().count() > 30 || !(p.image.is_empty() || p.image.starts_with("https://images.openfoodfacts.org/")) {
                return Err("That product doesn't look right.");
            }
        }
        item.qty = round(item.qty);
        item.min = round(item.min);
        item.want = round(item.want);
        let me = self.items.iter().position(|x| x.id == item.id).filter(|_| !item.id.is_empty());
        if self.items.iter().enumerate().any(|(i, x)| Some(i) != me && x.name.to_lowercase() == item.name.to_lowercase()) {
            return Err("That's in the pantry already.");
        }
        match me {
            Some(i) => {
                self.items[i] = item.clone();
                Ok(item.id)
            }
            None => {
                if self.items.len() >= MAX_ITEMS {
                    return Err("That's a lot in the pantry. Remove some things you don't keep.");
                }
                item.id = new_id("p", |id| self.items.iter().any(|x| x.id == id));
                self.items.push(item.clone());
                Ok(item.id)
            }
        }
    }

    pub fn remove_item(&mut self, id: &str) -> Result<(), &'static str> {
        let before = self.items.len();
        self.items.retain(|x| x.id != id);
        if self.items.len() == before { Err("That's gone from the pantry already.") } else { Ok(()) }
    }

    /// Change how much there is: by an amount (negative to use some), or set it outright.
    pub fn adjust(&mut self, id: &str, delta: Option<f64>, set: Option<f64>) -> Result<f64, &'static str> {
        let item = self.items.iter_mut().find(|x| x.id == id).ok_or("That's gone from the pantry already.")?;
        let next = match (set, delta) {
            (Some(s), _) => s,
            (None, Some(d)) => item.qty + d,
            (None, None) => return Err("Say how much."),
        };
        if !next.is_finite() || next > 100000.0 || delta.is_some_and(|d| !d.is_finite() || d.abs() > 100000.0) {
            return Err("That amount doesn't look right.");
        }
        item.qty = round(next.max(0.0));
        Ok(item.qty)
    }

    /// Take what a dinner used off the stock. Things that have gone are skipped.
    pub fn use_many(&mut self, uses: &[(String, f64)]) -> Result<usize, &'static str> {
        if uses.len() > 100 || uses.iter().any(|(_, d)| !d.is_finite() || d.abs() > 100000.0) {
            return Err("That's too much at once.");
        }
        let mut n = 0;
        for (id, d) in uses {
            if let Some(i) = self.items.iter_mut().find(|x| &x.id == id) {
                i.qty = round((i.qty + d).max(0.0));
                n += 1;
            }
        }
        Ok(n)
    }

    pub fn set_stores(&mut self, stores: Vec<Store>) -> Result<(), &'static str> {
        if stores.len() > MAX_STORES {
            return Err("Up to 12 shops, please.");
        }
        let mut out: Vec<Store> = Vec::new();
        for s in stores {
            let name = s.name.split_whitespace().collect::<Vec<_>>().join(" ");
            if name.is_empty() || name.chars().count() > 30 {
                return Err("Give each shop a name (up to 30 letters).");
            }
            if out.iter().any(|x| x.name.to_lowercase() == name.to_lowercase()) {
                return Err("Two shops have the same name.");
            }
            if !(s.color.len() == 7 && s.color.starts_with('#') && s.color[1..].bytes().all(|b| b.is_ascii_hexdigit())) {
                return Err("That colour isn't one we know.");
            }
            let id = if !s.id.is_empty() && self.stores.iter().any(|x| x.id == s.id) && !out.iter().any(|x| x.id == s.id) { s.id } else { new_id("t", |id| self.stores.iter().chain(out.iter()).any(|x| x.id == id)) };
            out.push(Store { id, name, color: s.color });
        }
        for i in &mut self.items {
            if !out.iter().any(|s| s.id == i.store) {
                i.store.clear();
            }
        }
        self.stores = out;
        Ok(())
    }

    /// Everything that has fallen below its minimum, and how much to buy.
    pub fn shortfalls(&self) -> Vec<(&Item, f64)> {
        self.items.iter().filter(|i| i.is_low()).map(|i| (i, i.to_buy())).collect()
    }

    /// The item for a barcode, or failing that, a name.
    pub fn find(&self, code: &str, name: &str) -> Option<&Item> {
        (!code.is_empty()).then(|| self.items.iter().find(|i| i.product.as_ref().is_some_and(|p| p.code == code))).flatten().or_else(|| self.items.iter().find(|i| i.name.to_lowercase() == name.trim().to_lowercase()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pantry() -> Pantry {
        let mut p = Pantry::default();
        p.set_stores(vec![Store { id: String::new(), name: "Woolworths".into(), color: "#14a06c".into() }]).unwrap();
        p
    }
    fn flour(p: &Pantry) -> Item {
        Item { name: "Flour".into(), qty: 1.0, unit: "kg".into(), min: 0.5, want: 2.0, store: p.stores[0].id.clone(), auto: true, ..Default::default() }
    }

    #[test]
    fn levels_decide_when_something_is_low_and_how_much_to_buy() {
        let mut p = pantry();
        let id = p.save_item(flour(&p)).unwrap();
        assert!(p.shortfalls().is_empty());
        p.adjust(&id, Some(-0.7), None).unwrap();
        let s = p.shortfalls();
        assert_eq!((s.len(), s[0].1), (1, 1.7), "0.3 kg left, wanted up to 2 kg");
        p.adjust(&id, None, Some(0.0)).unwrap();
        assert_eq!(p.adjust(&id, Some(-5.0), None).unwrap(), 0.0, "it can't go below nothing");
        let mut herbs = Item { name: "Basil".into(), qty: 1.0, min: 1.0, ..Default::default() };
        herbs.auto = false;
        assert!(!p.save_item(herbs).map(|id| p.items.iter().find(|i| i.id == id).unwrap().is_low()).unwrap(), "at the minimum is not below it");
        let mut spice = Item { name: "Paprika".into(), qty: 0.0, min: 2.0, ..Default::default() };
        spice.want = 0.0;
        let sid = p.save_item(spice).unwrap();
        assert_eq!(p.items.iter().find(|i| i.id == sid).unwrap().to_buy(), 4.0, "no 'want' means twice the minimum");
    }

    #[test]
    fn dinners_take_stock_off_and_removing_a_shop_clears_it() {
        let mut p = pantry();
        let id = p.save_item(flour(&p)).unwrap();
        assert_eq!(p.use_many(&[(id.clone(), -0.25), ("gone".into(), -1.0)]).unwrap(), 1);
        assert_eq!(p.items[0].qty, 0.75);
        p.set_stores(vec![]).unwrap();
        assert_eq!(p.items[0].store, "", "an item doesn't keep a shop that's been removed");
    }

    #[test]
    fn bad_input_is_turned_away() {
        let mut p = pantry();
        assert!(p.save_item(Item { name: "  ".into(), ..Default::default() }).is_err());
        assert!(p.save_item(Item { name: "Rice".into(), qty: -1.0, ..Default::default() }).is_err());
        assert!(p.save_item(Item { name: "Rice".into(), qty: f64::NAN, ..Default::default() }).is_err());
        assert!(p.save_item(Item { name: "Rice".into(), store: "nope".into(), ..Default::default() }).is_err());
        p.save_item(Item { name: "Rice".into(), ..Default::default() }).unwrap();
        assert!(p.save_item(Item { name: "rice".into(), ..Default::default() }).is_err(), "no two with the same name");
        assert!(p.set_stores(vec![Store { id: "".into(), name: "A".into(), color: "red".into() }]).is_err());
        assert_eq!(p.find("", " RICE ").map(|i| i.name.as_str()), Some("Rice"));
    }
}
