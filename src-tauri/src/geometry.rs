#[derive(Clone, Copy, Debug, Default, serde::Deserialize, serde::Serialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn clamp(mut rect: Bounds, work: Bounds) -> Bounds {
    rect.width = rect.width.max(1).min(work.width.max(1));
    rect.height = rect.height.max(1).min(work.height.max(1));
    rect.x = rect.x.clamp(
        work.x,
        work.x
            .saturating_add(work.width.saturating_sub(rect.width).min(i32::MAX as u32) as i32),
    );
    rect.y = rect.y.clamp(
        work.y,
        work.y
            .saturating_add(work.height.saturating_sub(rect.height).min(i32::MAX as u32) as i32),
    );
    rect
}

pub fn physical_size(width: u32, height: u32, scale: f64) -> (u32, u32) {
    (
        (width as f64 * scale).round() as u32,
        (height as f64 * scale).round() as u32,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clamps_to_negative_monitor_origin_and_small_work_area() {
        let work = Bounds {
            x: -1920,
            y: -100,
            width: 1920,
            height: 1040,
        };
        let rect = clamp(
            Bounds {
                x: -20,
                y: 900,
                width: 1000,
                height: 800,
            },
            work,
        );
        assert_eq!(
            (rect.x, rect.y, rect.width, rect.height),
            (-1000, 140, 1000, 800)
        );
        let rect = clamp(
            Bounds {
                x: 8000,
                y: 9000,
                width: 3000,
                height: 2000,
            },
            work,
        );
        assert_eq!(
            (rect.x, rect.y, rect.width, rect.height),
            (-1920, -100, 1920, 1040)
        );
        assert_eq!(clamp(Bounds::default(), Bounds::default()).width, 1);
    }
    #[test]
    fn applies_dpi_before_clamping() {
        assert_eq!(physical_size(320, 180, 1.5), (480, 270));
        let (width, height) = physical_size(1000, 790, 2.0);
        let rect = clamp(
            Bounds {
                x: 0,
                y: 0,
                width,
                height,
            },
            Bounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            },
        );
        assert_eq!((rect.width, rect.height), (1920, 1040));
    }
}
