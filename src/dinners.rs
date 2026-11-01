//! Dinners: the meals the family knows (Spaghetti Bolognese, Tacos…) and which one is planned for which day
//! (data/dinners.json).

use crate::family::Person;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const MAX_MEALS: usize = 300;

/// A real product from a shop's shelf (from Open Food Facts): its barcode is what any supermarket can be matched on.
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Product {
    pub code: String,
    pub name: String,
    #[serde(default)]
    pub brand: String,
    #[serde(default)]
    pub quantity: String,
    #[serde(default)]
    pub image: String,
}

/// One thing a dinner needs: what it is ("Pasta"), how much ("500 g"), optionally the exact product, and whether it's a
/// pantry staple the family usually has (so it isn't added to the shopping list without asking).
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Ingredient {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub product: Option<Product>,
    #[serde(default)]
    pub staple: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Meal {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub ingredients: Vec<Ingredient>,
    #[serde(default)]
    pub notes: String,
    /// A recipe online.
    #[serde(default)]
    pub link: String,
    /// How many it feeds, and how long it takes (0 for not said).
    #[serde(default)]
    pub serves: u32,
    #[serde(default)]
    pub minutes: u32,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favourite: bool,
}

/// Everything about a dinner but its name and id, as it is saved from the dinner's own page.
#[derive(Deserialize, Debug)]
pub struct MealDetails {
    #[serde(default)]
    pub ingredients: Vec<Ingredient>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub link: String,
    #[serde(default)]
    pub serves: u32,
    #[serde(default)]
    pub minutes: u32,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favourite: bool,
}

/// What's for dinner on one day, and (if said) who is cooking.
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Plan {
    pub meal: String,
    #[serde(default)]
    pub cook: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct Dinners {
    #[serde(default)]
    pub meals: Vec<Meal>,
    /// By day, like "2026-11-02".
    #[serde(default)]
    pub plan: BTreeMap<String, Plan>,
}

fn clean(name: &str) -> Result<String, &'static str> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() || name.chars().count() > 40 {
        return Err("Give the dinner a name (up to 40 letters).");
    }
    Ok(name)
}

fn new_id(taken: impl Fn(&str) -> bool) -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    (0..).map(|n| format!("m{t}x{n}")).find(|id| !taken(id)).unwrap()
}

impl Dinners {
    fn find_name(&self, name: &str) -> Option<&Meal> {
        self.meals.iter().find(|m| m.name.to_lowercase() == name.to_lowercase())
    }

    /// Add a dinner, or rename the one with this id. Returns its id.
    pub fn save_meal(&mut self, id: Option<&str>, name: &str) -> Result<String, &'static str> {
        let name = clean(name)?;
        let other = self.find_name(&name).map(|m| m.id.clone());
        match id.filter(|id| self.meals.iter().any(|m| m.id == *id)) {
            Some(id) => {
                if other.is_some_and(|o| o != id) {
                    return Err("You already have a dinner with that name.");
                }
                self.meals.iter_mut().find(|m| m.id == id).unwrap().name = name;
                Ok(id.to_string())
            }
            None => {
                if let Some(o) = other {
                    return Ok(o);
                }
                if self.meals.len() >= MAX_MEALS {
                    return Err("That's a lot of dinners. Remove some you don't make any more.");
                }
                let id = new_id(|id| self.meals.iter().any(|m| m.id == id));
                self.meals.push(Meal { id: id.clone(), name, ..Default::default() });
                Ok(id)
            }
        }
    }

    /// Save what a dinner needs and how it's made. Checks every part, and keeps the dinner's name and id.
    pub fn set_details(&mut self, id: &str, d: MealDetails) -> Result<(), &'static str> {
        let short = |s: &str, n: usize| s.trim().chars().count() <= n;
        if d.ingredients.len() > 60 || d.tags.len() > 8 || d.serves > 50 || d.minutes > 600 || !short(&d.notes, 1500) || !short(&d.link, 300) {
            return Err("Something in that dinner is too long.");
        }
        if !d.link.trim().is_empty() && !(d.link.trim().starts_with("https://") || d.link.trim().starts_with("http://")) {
            return Err("A recipe link should start with https://");
        }
        let mut ingredients: Vec<Ingredient> = Vec::new();
        for mut i in d.ingredients {
            i.name = i.name.split_whitespace().collect::<Vec<_>>().join(" ");
            i.amount = i.amount.trim().to_string();
            if i.name.is_empty() || !short(&i.name, 50) || !short(&i.amount, 30) {
                return Err("Each ingredient needs a name (up to 50 letters) and an amount (up to 30).");
            }
            if let Some(p) = &i.product {
                let image_ok = p.image.is_empty() || p.image.starts_with("https://images.openfoodfacts.org/");
                if p.code.len() > 14 || !p.code.bytes().all(|b| b.is_ascii_digit()) || !short(&p.name, 120) || !short(&p.brand, 80) || !short(&p.quantity, 30) || !image_ok {
                    return Err("That product doesn't look right.");
                }
            }
            if i.id.is_empty() || ingredients.iter().any(|x| x.id == i.id) {
                i.id = new_id(|id| ingredients.iter().any(|x| x.id.replacen('i', "m", 1) == id)).replacen('m', "i", 1);
            }
            ingredients.push(i);
        }
        let tags: Vec<String> = d.tags.iter().map(|t| t.split_whitespace().collect::<Vec<_>>().join(" ")).filter(|t| !t.is_empty()).collect();
        if tags.iter().any(|t| t.chars().count() > 20) {
            return Err("Tags are short, up to 20 letters.");
        }
        let m = self.meals.iter_mut().find(|m| m.id == id).ok_or("That dinner has gone already.")?;
        *m = Meal { id: m.id.clone(), name: m.name.clone(), ingredients, notes: d.notes.trim().to_string(), link: d.link.trim().to_string(), serves: d.serves, minutes: d.minutes, tags, favourite: d.favourite };
        Ok(())
    }

    /// Take a dinner out of the list, and off every day it was planned.
    pub fn remove_meal(&mut self, id: &str) -> Result<(), &'static str> {
        let before = self.meals.len();
        self.meals.retain(|m| m.id != id);
        if self.meals.len() == before {
            return Err("That dinner has gone already.");
        }
        self.plan.retain(|_, p| p.meal != id);
        Ok(())
    }

    /// Plan a dinner for a day: an existing one by id, or one by name (made if it's new). With neither, the day is cleared.
    pub fn set_plan(&mut self, date: &str, meal_id: Option<&str>, name: Option<&str>, cook: Option<&str>, people: &[Person]) -> Result<(), &'static str> {
        NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "That day doesn't look right.")?;
        if let Some(c) = cook.filter(|c| !c.is_empty()) {
            if !people.iter().any(|p| p.id == c) {
                return Err("That person isn't in the family any more.");
            }
        }
        let meal = match (meal_id.filter(|m| !m.is_empty()), name.filter(|n| !n.trim().is_empty())) {
            (Some(id), _) => {
                if !self.meals.iter().any(|m| m.id == id) {
                    return Err("That dinner has gone already.");
                }
                id.to_string()
            }
            (None, Some(n)) => self.save_meal(None, n)?,
            (None, None) => {
                self.plan.remove(date);
                return Ok(());
            }
        };
        let cook = cook.filter(|c| !c.is_empty()).map(str::to_string);
        self.plan.insert(date.to_string(), Plan { meal, cook });
        // Keep the plan from growing for ever: forget days from more than a year ago.
        if let Some(cut) = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok().and_then(|d| d.checked_sub_days(chrono::Days::new(400))) {
            let cut = cut.format("%Y-%m-%d").to_string();
            self.plan.retain(|d, _| *d >= cut);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dad() -> Vec<Person> {
        vec![Person { id: "p1".into(), name: "Dad".into(), color: "#2f6fe0".into(), birthday: None }]
    }

    #[test]
    fn dinners_can_be_added_planned_and_cleared() {
        let mut d = Dinners::default();
        let id = d.save_meal(None, "  Spaghetti   Bolognese ").unwrap();
        assert_eq!(d.meals[0].name, "Spaghetti Bolognese");
        assert_eq!(d.save_meal(None, "spaghetti bolognese").unwrap(), id, "same name, same dinner");
        d.set_plan("2026-11-02", Some(&id), None, Some("p1"), &dad()).unwrap();
        assert_eq!(d.plan["2026-11-02"], Plan { meal: id.clone(), cook: Some("p1".into()) });
        d.set_plan("2026-11-03", None, Some("Tacos"), None, &dad()).unwrap();
        assert_eq!(d.meals.len(), 2, "a new name makes a new dinner");
        d.set_plan("2026-11-02", None, None, None, &dad()).unwrap();
        assert!(!d.plan.contains_key("2026-11-02"));
    }

    #[test]
    fn renaming_and_removing_keep_the_plan_tidy() {
        let mut d = Dinners::default();
        let a = d.save_meal(None, "Tacos").unwrap();
        let b = d.save_meal(None, "Pizza").unwrap();
        assert!(d.save_meal(Some(&b), "tacos").is_err(), "can't take another dinner's name");
        d.save_meal(Some(&a), "Fish tacos").unwrap();
        d.set_plan("2026-11-04", Some(&a), None, None, &[]).unwrap();
        d.remove_meal(&a).unwrap();
        assert!(d.plan.is_empty(), "removed dinners come off the days");
        assert!(d.remove_meal(&a).is_err());
    }

    #[test]
    fn a_dinner_keeps_its_ingredients_and_the_exact_products() {
        let mut d = Dinners::default();
        let id = d.save_meal(None, "Spaghetti Bolognese").unwrap();
        let weetbix = Product { code: "9300652006520".into(), name: "Weet-Bix Blends Hi-Bran".into(), brand: "Weetbix".into(), quantity: "750 g".into(), image: String::new() };
        let ing = |n: &str, p: Option<Product>| Ingredient { name: n.into(), amount: "500 g".into(), product: p, ..Default::default() };
        let det = |i| MealDetails { ingredients: i, notes: " Simmer for an hour ".into(), link: String::new(), serves: 4, minutes: 45, tags: vec!["Quick".into()], favourite: true };
        d.set_details(&id, det(vec![ing("Pasta", None), ing("Cereal", Some(weetbix))])).unwrap();
        let m = &d.meals[0];
        assert_eq!((m.name.as_str(), m.notes.as_str(), m.serves, m.favourite), ("Spaghetti Bolognese", "Simmer for an hour", 4, true));
        assert!(m.ingredients.iter().all(|i| !i.id.is_empty()) && m.ingredients[0].id != m.ingredients[1].id, "each gets its own id");
        assert_eq!(m.ingredients[1].product.as_ref().unwrap().code, "9300652006520");
        assert!(d.set_details(&id, det(vec![ing("", None)])).is_err());
        assert!(d.set_details(&id, det(vec![ing("Rice", Some(Product { code: "12ab".into(), ..Default::default() }))])).is_err(), "a barcode is digits");
        assert!(d.set_details(&id, MealDetails { link: "javascript:1".into(), ..det(vec![]) }).is_err());
        assert!(d.set_details("nope", det(vec![])).is_err());
        assert_eq!(d.meals[0].ingredients.len(), 2, "a refused save changes nothing");
    }

    #[test]
    fn bad_input_is_turned_away() {
        let mut d = Dinners::default();
        assert!(d.save_meal(None, "   ").is_err());
        assert!(d.save_meal(None, &"x".repeat(41)).is_err());
        assert!(d.set_plan("tomorrow", None, Some("Tacos"), None, &[]).is_err());
        assert!(d.set_plan("2026-11-02", Some("nope"), None, None, &[]).is_err());
        assert!(d.set_plan("2026-11-02", None, Some("Tacos"), Some("ghost"), &dad()).is_err());
        assert!(d.plan.is_empty());
    }
}
