use crate::geometry::{clamp, physical_size, Bounds};
use crate::storage::Database;
use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub display_mode: String,
    pub compact_width: u32,
    pub compact_height: u32,
    pub expanded_width: u32,
    pub expanded_height: u32,
    pub animate: bool,
}

#[derive(Default)]
pub struct Geometry {
    pub compact: Option<Bounds>,
    pub expanded: bool,
    pub busy: bool,
}
#[derive(Default)]
pub struct Widget(pub Mutex<Geometry>);

fn bounds(window: &WebviewWindow) -> Result<Bounds, String> {
    let p = window.outer_position().map_err(|e| e.to_string())?;
    let s = window.outer_size().map_err(|e| e.to_string())?;
    Ok(Bounds {
        x: p.x,
        y: p.y,
        width: s.width,
        height: s.height,
    })
}

fn apply(window: &WebviewWindow, rect: Bounds) -> Result<(), String> {
    window
        .set_position(PhysicalPosition::new(rect.x, rect.y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(PhysicalSize::new(rect.width, rect.height))
        .map_err(|e| e.to_string())
}

pub fn restore(window: &WebviewWindow) -> Result<(), String> {
    let saved: Option<String> = {
        let state = window.state::<Database>();
        let db = state
            .inner()
            .0
            .lock()
            .map_err(|_| "Stockage indisponible")?;
        db.query_row(
            "SELECT value_json FROM settings WHERE key='widget-bounds'",
            [],
            |r| r.get(0),
        )
        .ok()
    };
    if let Some(rect) = saved.and_then(|s| serde_json::from_str::<Bounds>(&s).ok()) {
        window
            .state::<Widget>()
            .inner()
            .0
            .lock()
            .map_err(|_| "Widget indisponible")?
            .compact = Some(rect);
    }
    Ok(())
}

pub fn persist(window: &WebviewWindow) -> Result<(), String> {
    let rect = window
        .state::<Widget>()
        .inner()
        .0
        .lock()
        .map_err(|_| "Widget indisponible")?
        .compact;
    if let Some(rect) = rect {
        let state = window.state::<Database>();
        let db = state
            .inner()
            .0
            .lock()
            .map_err(|_| "Stockage indisponible")?;
        db.execute("INSERT INTO settings(key,value_json,updated_at) VALUES('widget-bounds',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at", [serde_json::to_string(&rect).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn transition(window: WebviewWindow, expanded: bool, options: Options) -> Result<Bounds, String> {
    if !["desktop", "floating", "hybrid"].contains(&options.display_mode.as_str())
        || !(280..=600).contains(&options.compact_width)
        || !(160..=350).contains(&options.compact_height)
        || !(600..=1400).contains(&options.expanded_width)
        || !(450..=1100).contains(&options.expanded_height)
    {
        return Err("Dimensions ou mode invalides".into());
    }
    let start = bounds(&window)?;
    let (compact, was_expanded) = {
        let state = window.state::<Widget>();
        let mut state = state.inner().0.lock().map_err(|_| "Widget indisponible")?;
        if state.busy {
            return Err("Une transition est déjà en cours".into());
        }
        state.busy = true;
        if !state.expanded && state.compact.is_none() {
            state.compact = Some(start);
        }
        (state.compact.unwrap_or(start), state.expanded)
    };
    let result = (|| {
        let monitors = window.available_monitors().map_err(|e| e.to_string())?;
        let monitor = monitors
            .iter()
            .find(|m| {
                let p = m.position();
                let s = m.size();
                compact.x >= p.x
                    && compact.y >= p.y
                    && (compact.x as i64) < p.x as i64 + s.width as i64
                    && (compact.y as i64) < p.y as i64 + s.height as i64
            })
            .or_else(|| monitors.first())
            .ok_or("Aucun écran disponible")?;
        let scale = monitor.scale_factor();
        let work = monitor.work_area();
        let work = Bounds {
            x: work.position.x,
            y: work.position.y,
            width: work.size.width,
            height: work.size.height,
        };
        let (compact_width, compact_height) =
            physical_size(options.compact_width, options.compact_height, scale);
        let (expanded_width, expanded_height) =
            physical_size(options.expanded_width, options.expanded_height, scale);
        let compact = clamp(
            Bounds {
                width: compact_width,
                height: compact_height,
                ..compact
            },
            work,
        );
        let target = if expanded {
            clamp(
                Bounds {
                    width: expanded_width,
                    height: expanded_height,
                    ..compact
                },
                work,
            )
        } else {
            compact
        };
        // Enforce the desktop layer even for preferences saved by older versions.
        window.set_always_on_top(false).map_err(|e| e.to_string())?;
        window
            .set_always_on_bottom(true)
            .map_err(|e| e.to_string())?;
        if options.animate && expanded != was_expanded {
            let clock = Instant::now();
            while clock.elapsed().as_millis() < 320 {
                let t = clock.elapsed().as_secs_f64() / 0.32;
                // Damped spring, bounded to avoid overshooting the monitor work area.
                let ease = (1.0 - (-8.0 * t).exp() * (5.0 * t).cos()).clamp(0.0, 1.0);
                let lerp = |a: f64, b: f64| a + (b - a) * ease;
                apply(
                    &window,
                    Bounds {
                        x: lerp(start.x as f64, target.x as f64).round() as i32,
                        y: lerp(start.y as f64, target.y as f64).round() as i32,
                        width: lerp(start.width as f64, target.width as f64).round() as u32,
                        height: lerp(start.height as f64, target.height as f64).round() as u32,
                    },
                )?;
                std::thread::sleep(Duration::from_millis(16));
            }
        }
        apply(&window, target)?;
        {
            let state = window.state::<Widget>();
            let mut state = state.inner().0.lock().map_err(|_| "Widget indisponible")?;
            state.compact = Some(compact);
            state.expanded = expanded;
        }
        persist(&window)?;
        window.show().map_err(|e| e.to_string())?;
        let _ = window.emit("widget-settled", target);
        Ok(target)
    })();
    if result.is_err() {
        let _ = apply(&window, start);
        let _ = window.set_always_on_top(false);
        let _ = window.set_always_on_bottom(true);
    }
    if let Ok(mut state) = window.state::<Widget>().inner().0.lock() {
        state.busy = false;
        if result.is_err() {
            state.expanded = was_expanded;
        }
    }
    result
}

#[tauri::command]
pub async fn widget_transition(
    window: WebviewWindow,
    expanded: bool,
    options: Options,
) -> Result<Bounds, String> {
    tauri::async_runtime::spawn_blocking(move || transition(window, expanded, options))
        .await
        .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct Screen {
    name: String,
    width: u32,
    height: u32,
    scale: f64,
}

#[tauri::command]
pub fn widget_screens(window: WebviewWindow) -> Result<Vec<Screen>, String> {
    Ok(window
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .enumerate()
        .map(|(index, m)| Screen {
            name: m
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Écran {}", index + 1)),
            width: m.size().width,
            height: m.size().height,
            scale: m.scale_factor(),
        })
        .collect())
}

#[tauri::command]
pub fn widget_place(window: WebviewWindow, screen: usize, corner: String) -> Result<(), String> {
    if !["top-left", "top-right", "bottom-left", "bottom-right"].contains(&corner.as_str()) {
        return Err("Position invalide".into());
    }
    let monitor = window
        .available_monitors()
        .map_err(|e| e.to_string())?
        .get(screen)
        .cloned()
        .ok_or("Écran absent")?;
    let work = monitor.work_area();
    let work = Bounds {
        x: work.position.x,
        y: work.position.y,
        width: work.size.width,
        height: work.size.height,
    };
    let actual = bounds(&window)?;
    let (compact, expanded) = {
        let state = window.state::<Widget>();
        let mut state = state.inner().0.lock().map_err(|_| "Widget indisponible")?;
        if state.busy {
            return Err("Attendre la fin de la transition".into());
        }
        state.busy = true;
        (state.compact.unwrap_or(actual), state.expanded)
    };
    let x = if corner.ends_with("right") {
        work.x
            .saturating_add(work.width as i32)
            .saturating_sub(compact.width as i32)
            .saturating_sub(20)
    } else {
        work.x.saturating_add(20)
    };
    let y = if corner.starts_with("bottom") {
        work.y
            .saturating_add(work.height as i32)
            .saturating_sub(compact.height as i32)
            .saturating_sub(20)
    } else {
        work.y.saturating_add(20)
    };
    let compact = clamp(Bounds { x, y, ..compact }, work);
    let target = clamp(
        if expanded {
            Bounds {
                x: compact.x,
                y: compact.y,
                ..actual
            }
        } else {
            compact
        },
        work,
    );
    let result = apply(&window, target);
    {
        let state = window.state::<Widget>();
        let mut state = state.inner().0.lock().map_err(|_| "Widget indisponible")?;
        state.busy = false;
        if result.is_ok() {
            state.compact = Some(compact);
        }
    }
    result?;
    persist(&window)
}
