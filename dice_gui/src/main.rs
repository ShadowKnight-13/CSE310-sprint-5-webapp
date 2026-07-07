use dice_core::{make_roll, make_roll_owned, parse_notation, roll_dice, Roll};
use eframe::egui;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const FAVORITES_FILE_NAME: &str = "favorite_rolls.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RollMode {
    Normal,
    Advantage,
    Disadvantage,
}

impl RollMode {
    fn label(self) -> &'static str {
        match self {
            RollMode::Normal => "Normal",
            RollMode::Advantage => "Advantage",
            RollMode::Disadvantage => "Disadvantage",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FavoriteRoll {
    name: String,
    notation: String,
    category: String,
}

#[derive(Debug, Clone, Default)]
struct FavoriteSessionStats {
    uses: u32,
    total_sum: i64,
    recent_totals: Vec<i32>,
}

fn main() -> eframe::Result<()> {
    // CLI fallback using the same core library:
    // cargo run -p dice_gui -- 2d6+1
    if let Some(notation) = std::env::args().nth(1) {
        match make_roll_owned(notation) {
            Ok(roll) => {
                println!("Notation: {}", roll.notation);
                println!("Results: {:?}", roll.results);
                println!("Total: {}", roll.total);
            }
            Err(err) => {
                eprintln!("Error: {err}");
            }
        }
        return Ok(());
    }

    let options = eframe::NativeOptions::default();
    eframe::run_native(
        "Rust D&D Dice Roller",
        options,
        Box::new(|_cc| Box::<DiceApp>::default()),
    )
}

struct DiceApp {
    notation: String,
    last_roll: Option<Roll>,
    error_message: String,
    info_message: String,
    history: Vec<String>,
    favorites: Vec<FavoriteRoll>,
    favorite_name_input: String,
    favorite_category_input: String,
    roll_mode: RollMode,
    calculator_input: String,
    calculator_result: String,
    calculator_error: String,
    calculator_log: Vec<(String, String)>,
    calculator_last_answer: Option<f64>,
    calculator_expanded: bool,
    favorite_search_input: String,
    drag_source_index: Option<usize>,
    drag_hover_index: Option<usize>,
    pending_roll_label: Option<String>,
    show_full_roll_log: bool,
    pending_favorite_stats_key: Option<String>,
    favorite_session_stats: HashMap<String, FavoriteSessionStats>,
    dark_mode_enabled: bool,
    lock_categories_sorted: bool,
}

impl Default for DiceApp {
    fn default() -> Self {
        let favorites = DiceApp::load_favorites_from_disk();

        Self {
            notation: "2d6+1".to_owned(),
            last_roll: None,
            error_message: String::new(),
            info_message: String::new(),
            history: Vec::new(),
            favorites,
            favorite_name_input: String::new(),
            favorite_category_input: "General".to_owned(),
            roll_mode: RollMode::Normal,
            calculator_input: "(12+5)*2".to_owned(),
            calculator_result: String::new(),
            calculator_error: String::new(),
            calculator_log: Vec::new(),
            calculator_last_answer: None,
            calculator_expanded: false,
            favorite_search_input: String::new(),
            drag_source_index: None,
            drag_hover_index: None,
            pending_roll_label: None,
            show_full_roll_log: false,
            pending_favorite_stats_key: None,
            favorite_session_stats: HashMap::new(),
            dark_mode_enabled: false,
            lock_categories_sorted: false,
        }
    }
}

impl DiceApp {
    fn favorite_stats_key(name: &str, notation: &str, category: &str) -> String {
        format!("{}|{}|{}", name, notation, category)
    }

    fn bump_favorite_stats_for_total(&mut self, total: i32) {
        if let Some(key) = self.pending_favorite_stats_key.take() {
            let entry = self.favorite_session_stats.entry(key).or_default();
            entry.uses += 1;
            entry.total_sum += total as i64;
            entry.recent_totals.push(total);
            if entry.recent_totals.len() > 10 {
                entry.recent_totals.remove(0);
            }
        }
    }

    fn favorite_session_average(&self, favorite: &FavoriteRoll) -> Option<f64> {
        let key = Self::favorite_stats_key(&favorite.name, &favorite.notation, &favorite.category);
        self.favorite_session_stats.get(&key).and_then(|stats| {
            if stats.uses == 0 {
                None
            } else {
                Some(stats.total_sum as f64 / stats.uses as f64)
            }
        })
    }

    fn favorite_session_uses(&self, favorite: &FavoriteRoll) -> u32 {
        let key = Self::favorite_stats_key(&favorite.name, &favorite.notation, &favorite.category);
        self.favorite_session_stats
            .get(&key)
            .map(|stats| stats.uses)
            .unwrap_or(0)
    }

    fn favorite_recent_totals(&self, favorite: &FavoriteRoll) -> Vec<i32> {
        let key = Self::favorite_stats_key(&favorite.name, &favorite.notation, &favorite.category);
        self.favorite_session_stats
            .get(&key)
            .map(|stats| stats.recent_totals.clone())
            .unwrap_or_default()
    }

    fn draw_tiny_trend(ui: &mut egui::Ui, totals: &[i32]) {
        if totals.is_empty() {
            ui.label("n/a");
            return;
        }

        let min_v = *totals.iter().min().unwrap_or(&0) as f32;
        let max_v = *totals.iter().max().unwrap_or(&0) as f32;
        ui.horizontal(|ui| {
            for value in totals {
                let h = if (max_v - min_v).abs() < f32::EPSILON {
                    12.0
                } else {
                    4.0 + 12.0 * ((*value as f32 - min_v) / (max_v - min_v))
                };
                let (rect, _) = ui.allocate_exact_size(egui::vec2(6.0, 16.0), egui::Sense::hover());
                let bar = egui::Rect::from_min_max(
                    egui::pos2(rect.min.x, rect.max.y - h),
                    egui::pos2(rect.max.x, rect.max.y),
                );
                ui.painter().rect_filled(bar, 1.0, egui::Color32::LIGHT_BLUE);
            }
        });
    }

    fn favorites_file_path() -> PathBuf {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(FAVORITES_FILE_NAME)
    }

    fn load_favorites_from_disk() -> Vec<FavoriteRoll> {
        let path = Self::favorites_file_path();
        let content = match fs::read_to_string(path) {
            Ok(text) => text,
            Err(_) => return Vec::new(),
        };

        serde_json::from_str::<Vec<FavoriteRoll>>(&content).unwrap_or_default()
    }

    fn save_favorites_to_disk(&mut self) {
        let path = Self::favorites_file_path();
        match serde_json::to_string_pretty(&self.favorites) {
            Ok(json) => {
                if let Err(err) = fs::write(path, json) {
                    self.error_message = format!("failed to save favorites: {err}");
                }
            }
            Err(err) => {
                self.error_message = format!("failed to encode favorites: {err}");
            }
        }
    }

    fn favorite_matches_search(favorite: &FavoriteRoll, query: &str) -> bool {
        let normalized = query.trim().to_lowercase();
        if normalized.is_empty() {
            return true;
        }

        favorite.name.to_lowercase().contains(&normalized)
            || favorite.notation.to_lowercase().contains(&normalized)
            || favorite.category.to_lowercase().contains(&normalized)
    }

    fn run_roll_notation(&mut self, notation: &str) {
        let trimmed = notation.trim();
        if trimmed.is_empty() {
            self.last_roll = None;
            self.error_message = "notation cannot be empty".to_string();
            return;
        }

        self.info_message.clear();

        match self.roll_mode {
            RollMode::Normal => self.run_standard_roll(trimmed, None),
            RollMode::Advantage => self.run_advantage_disadvantage_roll(trimmed, true),
            RollMode::Disadvantage => self.run_advantage_disadvantage_roll(trimmed, false),
        }
    }

    fn run_standard_roll(&mut self, notation: &str, detail: Option<&str>) {
        // Borrowing example: pass notation without moving ownership.
        match make_roll(notation) {
            Ok(roll) => {
                self.error_message.clear();
                let label_prefix = self.pending_roll_label.take();
                let base_entry = match detail {
                    Some(note) => format!(
                        "{} => {:?} = {} ({})",
                        roll.notation, roll.results, roll.total, note
                    ),
                    None => format!("{} => {:?} = {}", roll.notation, roll.results, roll.total),
                };
                let history_entry = match label_prefix {
                    Some(label) => format!("[{}] {}", label, base_entry),
                    None => base_entry,
                };
                self.history.push(history_entry);
                self.bump_favorite_stats_for_total(roll.total);
                self.last_roll = Some(roll);
            }
            Err(err) => {
                self.pending_favorite_stats_key = None;
                self.last_roll = None;
                self.error_message = err.to_string();
            }
        }
    }

    fn run_advantage_disadvantage_roll(&mut self, notation: &str, keep_higher: bool) {
        match parse_notation(notation) {
            Ok(spec) => {
                if spec.count != 1 || spec.sides != 20 {
                    self.info_message =
                        "Advantage/disadvantage only applies to single d20 rolls. Rolled normally."
                            .to_string();
                    self.run_standard_roll(notation, None);
                    return;
                }

                let first = roll_dice(1, 20)[0] as i32;
                let second = roll_dice(1, 20)[0] as i32;
                let chosen = if keep_higher {
                    first.max(second)
                } else {
                    first.min(second)
                };
                let total = chosen + spec.modifier;

                let detail = if keep_higher {
                    format!("advantage: rolled {} and {}, kept {}", first, second, chosen)
                } else {
                    format!("disadvantage: rolled {} and {}, kept {}", first, second, chosen)
                };

                self.last_roll = Some(Roll {
                    notation: notation.to_owned(),
                    results: vec![chosen as u32],
                    total,
                });
                self.error_message.clear();
                self.info_message = detail.clone();
                let adv_base = format!(
                    "{} => [{}] modifier {} = {}",
                    notation, detail, spec.modifier, total
                );
                let adv_entry = match self.pending_roll_label.take() {
                    Some(label) => format!("[{}] {}", label, adv_base),
                    None => adv_base,
                };
                self.history.push(adv_entry);
                self.bump_favorite_stats_for_total(total);
            }
            Err(err) => {
                self.pending_favorite_stats_key = None;
                self.last_roll = None;
                self.error_message = err.to_string();
            }
        }
    }

    fn add_favorite(&mut self) {
        let notation = self.notation.trim().to_owned();
        if notation.is_empty() {
            self.error_message = "cannot favorite an empty notation".to_string();
            return;
        }

        let mut name = self.favorite_name_input.trim().to_owned();
        if name.is_empty() {
            name = notation.clone();
        }

        let mut category = self.favorite_category_input.trim().to_owned();
        if category.is_empty() {
            category = "General".to_string();
        }

        if self
            .favorites
            .iter()
            .any(|f| f.notation == notation && f.category == category)
        {
            self.error_message = "favorite already exists".to_string();
            return;
        }

        self.favorites.push(FavoriteRoll {
            name,
            notation,
            category,
        });

        if self.lock_categories_sorted {
            self.favorites
                .sort_by(|a, b| a.category.to_lowercase().cmp(&b.category.to_lowercase()));
        }

        self.favorite_name_input.clear();
        self.error_message.clear();
        self.info_message = "favorite saved".to_string();
        self.save_favorites_to_disk();
    }

    fn run_calculator(&mut self) {
        let expr = self.calculator_input.trim().to_owned();
        if expr.is_empty() {
            self.calculator_error = "enter an expression to calculate".to_string();
            self.calculator_result.clear();
            return;
        }

        let mut ctx = meval::Context::new();
        if let Some(ans) = self.calculator_last_answer {
            ctx.var("ans", ans);
        }

        match meval::eval_str_with_context(&expr, &ctx) {
            Ok(value) => {
                let display = if value.fract().abs() < f64::EPSILON {
                    format!("{:.0}", value)
                } else {
                    format!("{:.2}", value)
                };

                self.calculator_result = display.clone();
                self.calculator_last_answer = Some(value);
                self.calculator_log.push((expr, display));
                if self.calculator_log.len() > 30 {
                    self.calculator_log.remove(0);
                }
                self.calculator_error.clear();
            }
            Err(err) => {
                self.calculator_error = format!("calculator error: {err}");
                self.calculator_result.clear();
            }
        }
    }
}

impl eframe::App for DiceApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if self.dark_mode_enabled {
            ctx.set_visuals(egui::Visuals::dark());
        } else {
            ctx.set_visuals(egui::Visuals::light());
        }

        let calculator_width = if self.calculator_expanded { 360.0 } else { 230.0 };
        egui::SidePanel::right("calculator_panel")
            .resizable(true)
            .default_width(calculator_width)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.heading("Calculator");
                    let label = if self.calculator_expanded {
                        "Compact"
                    } else {
                        "Expand"
                    };
                    if ui.button(label).clicked() {
                        self.calculator_expanded = !self.calculator_expanded;
                    }
                });

                ui.label("Use +, -, *, / and parentheses. You can reference previous answer as ans.");

                if self.calculator_expanded {
                    ui.add(
                        egui::TextEdit::multiline(&mut self.calculator_input)
                            .desired_rows(3)
                            .desired_width(f32::INFINITY),
                    );
                } else {
                    ui.text_edit_singleline(&mut self.calculator_input);
                }

                ui.horizontal(|ui| {
                    if ui.button("Calculate").clicked() {
                        self.run_calculator();
                    }

                    if ui.button("Insert ans").clicked() {
                        if !self.calculator_input.is_empty() {
                            self.calculator_input.push(' ');
                        }
                        self.calculator_input.push_str("ans");
                    }

                    if ui.button("Clear Log").clicked() {
                        self.calculator_log.clear();
                    }
                });

                if let Some(ans) = self.calculator_last_answer {
                    ui.label(format!("ans = {:.2}", ans));
                }

                if !self.calculator_result.is_empty() {
                    ui.label(format!("Result: {}", self.calculator_result));

                    if ui.button("Use Result As Notation").clicked() {
                        self.notation = self.calculator_result.clone();
                    }
                }

                if !self.calculator_error.is_empty() {
                    ui.colored_label(egui::Color32::RED, &self.calculator_error);
                }

                ui.separator();
                ui.label("Calculator Log:");
                egui::ScrollArea::vertical()
                    .max_height(if self.calculator_expanded { 260.0 } else { 140.0 })
                    .show(ui, |ui| {
                        for idx in (0..self.calculator_log.len()).rev() {
                            let (expr, result) = &self.calculator_log[idx];
                            ui.horizontal(|ui| {
                                if ui
                                    .small_button(format!("{} = {}", expr, result))
                                    .clicked()
                                {
                                    self.calculator_input = expr.clone();
                                }

                                if ui.small_button("Use Result").clicked() {
                                    self.calculator_input = result.clone();
                                }
                            });
                        }
                    });
            });

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("D&D Dice Roller");
            ui.label("Enter notation such as 2d6+1, d20, or 4d8-2");

            ui.checkbox(&mut self.dark_mode_enabled, "Dark Mode");

            ui.horizontal(|ui| {
                ui.label("Notation:");
                ui.text_edit_singleline(&mut self.notation);
            });

            ui.horizontal(|ui| {
                ui.label("Mode:");
                ui.radio_value(&mut self.roll_mode, RollMode::Normal, RollMode::Normal.label());
                ui.radio_value(
                    &mut self.roll_mode,
                    RollMode::Advantage,
                    RollMode::Advantage.label(),
                );
                ui.radio_value(
                    &mut self.roll_mode,
                    RollMode::Disadvantage,
                    RollMode::Disadvantage.label(),
                );
            });

            ui.horizontal(|ui| {
                if ui.button("Roll").clicked() {
                    let notation = self.notation.clone();
                    self.pending_favorite_stats_key = None;
                    self.run_roll_notation(&notation);
                }

                if ui.button("Save Favorite").clicked() {
                    self.add_favorite();
                }

                if ui.button("View Full Roll Log").clicked() {
                    self.show_full_roll_log = true;
                }
            });

            if self.show_full_roll_log {
                egui::Window::new("Session Roll Log")
                    .open(&mut self.show_full_roll_log)
                    .resizable(true)
                    .vscroll(true)
                    .default_size(egui::vec2(560.0, 420.0))
                    .show(ctx, |ui| {
                        ui.label("Full roll history for this app session.");
                        if ui.button("Clear Session Roll Log").clicked() {
                            self.history.clear();
                        }

                        if self.history.is_empty() {
                            ui.label("No rolls yet in this session.");
                        } else {
                            for (idx, entry) in self.history.iter().enumerate().rev() {
                                ui.label(format!("{}. {}", idx + 1, entry));
                            }
                        }
                    });
            }

            ui.horizontal(|ui| {
                ui.label("Favorite Name:");
                ui.text_edit_singleline(&mut self.favorite_name_input);
            });

            ui.horizontal(|ui| {
                ui.label("Category:");
                ui.text_edit_singleline(&mut self.favorite_category_input);
            });

            if !self.favorites.is_empty() {
                ui.separator();
                ui.heading("Favorite Rolls");

                ui.horizontal(|ui| {
                    ui.label("Search:");
                    ui.text_edit_singleline(&mut self.favorite_search_input);
                    ui.checkbox(&mut self.lock_categories_sorted, "Lock Category Order");
                });

                let mut remove_index: Option<usize> = None;
                let mut move_up_index: Option<usize> = None;
                let mut move_down_index: Option<usize> = None;
                let mut roll_item: Option<(String, String, String)> = None;
                let mut next_drag_hover: Option<usize> = None;
                let mut use_notation: Option<String> = None;
                let mut move_drag_drop: Option<(usize, usize)> = None;
                let mut recategorize_drag_drop: Option<(usize, String)> = None;
                let mut changed_favorites = false;
                let pointer_released = ui.input(|i| i.pointer.any_released());

                if self.lock_categories_sorted {
                    self.favorites
                        .sort_by(|a, b| a.category.to_lowercase().cmp(&b.category.to_lowercase()));
                }

                let visible_indices: Vec<usize> = self
                    .favorites
                    .iter()
                    .enumerate()
                    .filter_map(|(idx, favorite)| {
                        if Self::favorite_matches_search(favorite, &self.favorite_search_input) {
                            Some(idx)
                        } else {
                            None
                        }
                    })
                    .collect();

                let mut category_order: Vec<String> = Vec::new();
                for idx in &visible_indices {
                    let category = self.favorites[*idx].category.clone();
                    if !category_order.iter().any(|c| c == &category) {
                        category_order.push(category);
                    }
                }

                for category in category_order {
                    let panel = egui::CollapsingHeader::new(format!("{}", category))
                        .default_open(true)
                        .show(ui, |ui| {
                            let indices_in_category: Vec<usize> = visible_indices
                                .iter()
                                .copied()
                                .filter(|idx| self.favorites[*idx].category == category)
                                .collect();

                            // Loop over favorites so users can reroll with one click.
                            for idx in indices_in_category {
                                // Drop indicator: yellow bar above the row that will receive the drop
                                if self.drag_source_index.is_some()
                                    && self.drag_source_index != Some(idx)
                                    && self.drag_hover_index == Some(idx)
                                {
                                    let w = ui.available_width();
                                    let (rect, _) = ui.allocate_exact_size(
                                        egui::vec2(w, 3.0),
                                        egui::Sense::hover(),
                                    );
                                    ui.painter().rect_filled(rect, 0.0, egui::Color32::YELLOW);
                                }

                                let mut this_row_hovered = false;
                                ui.horizontal(|ui| {
                                    let drag_response = ui.add(
                                        egui::Label::new("Drag").sense(egui::Sense::click_and_drag()),
                                    );
                                    if drag_response.drag_started() {
                                        self.drag_source_index = Some(idx);
                                    }

                                    if let Some(source_idx) = self.drag_source_index {
                                        if source_idx != idx && drag_response.hovered() && pointer_released {
                                            move_drag_drop = Some((source_idx, idx));
                                        }
                                    }

                                    let favorite = &mut self.favorites[idx];
                                    let name_changed =
                                        ui.text_edit_singleline(&mut favorite.name).changed();
                                    let notation_changed =
                                        ui.text_edit_singleline(&mut favorite.notation).changed();
                                    let category_changed =
                                        ui.text_edit_singleline(&mut favorite.category).changed();

                                    if name_changed || notation_changed || category_changed {
                                        changed_favorites = true;
                                    }

                                    if ui.button("Roll Favorite").clicked() {
                                        let stats_key = Self::favorite_stats_key(
                                            &favorite.name,
                                            &favorite.notation,
                                            &favorite.category,
                                        );
                                        roll_item = Some((
                                            favorite.notation.clone(),
                                            favorite.name.clone(),
                                            stats_key,
                                        ));
                                    }

                                    if ui.button("Use").clicked() {
                                        use_notation = Some(favorite.notation.clone());
                                    }

                                    if ui.button("Up").clicked() && idx > 0 {
                                        move_up_index = Some(idx);
                                    }

                                    if ui.button("Down").clicked() && idx + 1 < self.favorites.len() {
                                        move_down_index = Some(idx);
                                    }

                                    if ui.button("Remove").clicked() {
                                        remove_index = Some(idx);
                                    }

                                    if self.drag_source_index.is_some() {
                                        this_row_hovered = ui.ui_contains_pointer();
                                    }
                                });

                                if let Some(avg) = self.favorite_session_average(&self.favorites[idx]) {
                                    let uses = self.favorite_session_uses(&self.favorites[idx]);
                                    ui.label(format!("Session avg: {:.2} over {} roll(s)", avg, uses));
                                } else {
                                    ui.label("Session avg: n/a");
                                }

                                ui.horizontal(|ui| {
                                    ui.label("Trend:");
                                    let trend = self.favorite_recent_totals(&self.favorites[idx]);
                                    Self::draw_tiny_trend(ui, &trend);
                                });

                                if this_row_hovered {
                                    next_drag_hover = Some(idx);
                                }
                            }
                        });

                    if let Some(source_idx) = self.drag_source_index {
                        if panel.header_response.hovered() && pointer_released {
                            recategorize_drag_drop = Some((source_idx, category.clone()));
                        }
                    }
                }

                // Update the drop-target indicator for the next frame
                if self.drag_source_index.is_some() {
                    self.drag_hover_index = next_drag_hover;
                } else {
                    self.drag_hover_index = None;
                }

                if let Some(idx) = move_up_index {
                    let can_move = if self.lock_categories_sorted {
                        idx > 0
                            && self.favorites[idx - 1].category.eq_ignore_ascii_case(&self.favorites[idx].category)
                    } else {
                        idx > 0
                    };

                    if can_move {
                        self.favorites.swap(idx - 1, idx);
                        changed_favorites = true;
                    }
                }

                if let Some(idx) = move_down_index {
                    let can_move = if self.lock_categories_sorted {
                        idx + 1 < self.favorites.len()
                            && self.favorites[idx + 1]
                                .category
                                .eq_ignore_ascii_case(&self.favorites[idx].category)
                    } else {
                        idx + 1 < self.favorites.len()
                    };

                    if can_move {
                        self.favorites.swap(idx, idx + 1);
                        changed_favorites = true;
                    }
                }

                if let Some(idx) = remove_index {
                    self.favorites.remove(idx);
                    changed_favorites = true;
                }

                if let Some((source_idx, target_idx)) = move_drag_drop {
                    if source_idx < self.favorites.len() && target_idx < self.favorites.len() {
                        if self.lock_categories_sorted
                            && !self.favorites[source_idx]
                                .category
                                .eq_ignore_ascii_case(&self.favorites[target_idx].category)
                        {
                            self.info_message =
                                "Category lock is on: drag-drop reorder works within the same category."
                                    .to_string();
                        } else {
                            let moving = self.favorites.remove(source_idx);
                            let insert_at = if source_idx < target_idx {
                                target_idx - 1
                            } else {
                                target_idx
                            };
                            self.favorites.insert(insert_at, moving);
                            changed_favorites = true;
                        }
                    }
                }

                if let Some((source_idx, category)) = recategorize_drag_drop {
                    if source_idx < self.favorites.len() {
                        self.favorites[source_idx].category = category;
                        changed_favorites = true;
                    }
                }

                if self.lock_categories_sorted {
                    self.favorites
                        .sort_by(|a, b| a.category.to_lowercase().cmp(&b.category.to_lowercase()));
                }

                if pointer_released {
                    self.drag_source_index = None;
                }

                if let Some(notation) = use_notation {
                    self.notation = notation;
                    self.error_message.clear();
                }

                if let Some((notation, label, stats_key)) = roll_item {
                    self.pending_roll_label = Some(label);
                    self.pending_favorite_stats_key = Some(stats_key);
                    self.notation = notation.clone();
                    self.run_roll_notation(&notation);
                    self.pending_roll_label = None;
                }

                if changed_favorites {
                    self.save_favorites_to_disk();
                }
            }

            ui.separator();

            if !self.error_message.is_empty() {
                ui.colored_label(egui::Color32::RED, format!("Error: {}", self.error_message));
            }

            if !self.info_message.is_empty() {
                ui.colored_label(egui::Color32::LIGHT_BLUE, &self.info_message);
            }

            if let Some(roll) = &self.last_roll {
                let breakdown = match parse_notation(&roll.notation) {
                    Ok(spec) if spec.modifier > 0 => format!(
                        "Dice {:?}  +{}  =  {}",
                        roll.results, spec.modifier, roll.total
                    ),
                    Ok(spec) if spec.modifier < 0 => format!(
                        "Dice {:?}  {}  =  {}",
                        roll.results, spec.modifier, roll.total
                    ),
                    _ => format!("Dice {:?}  =  {}", roll.results, roll.total),
                };
                ui.label(breakdown);
                ui.label(format!("Total: {}", roll.total));
            }

            ui.separator();
            ui.label("Recent rolls:");
            // Loop requirement: iterate over roll history for display.
            for entry in self.history.iter().rev().take(5) {
                ui.label(entry);
            }
        });
    }
}
