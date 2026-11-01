//! Dinners: the meals the family knows (Spaghetti Bolognese, Tacos…) and which one is planned for which day
//! (data/dinners.json).

use crate::family::Person;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const MAX_MEALS: usize = 300;

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Meal {
    pub id: String,
    pub name: String,
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
                self.meals.push(Meal { id: id.clone(), name });
                Ok(id)
            }
        }
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
