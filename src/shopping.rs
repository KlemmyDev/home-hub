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

fn new_id(taken: impl Fn(&str) -> bool) -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    (0..).map(|n| format!("s{t}x{n}")).find(|id| !taken(id)).unwrap()
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
        self.items.push(Item { id: id.clone(), name, done: false, ..Default::default() });
        Ok(id)
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
