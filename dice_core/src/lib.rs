use rand::Rng;
use std::fmt;

// Stretch challenge: a struct represents one completed roll.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Roll {
    pub notation: String,
    pub results: Vec<u32>,
    pub total: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    InvalidFormat,
    InvalidNumber,
    Unsupported,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::InvalidFormat => write!(f, "invalid dice format"),
            ParseError::InvalidNumber => write!(f, "invalid number in notation"),
            ParseError::Unsupported => write!(f, "notation is syntactically valid but unsupported"),
        }
    }
}

impl std::error::Error for ParseError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiceSpec {
    pub count: u32,
    pub sides: u32,
    pub modifier: i32,
}

/// Borrows the input string and parses forms like "2d6+1", "d20", and "4d8-2".
pub fn parse_notation(s: &str) -> Result<DiceSpec, ParseError> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Err(ParseError::InvalidFormat);
    }

    let (count_part, rest) = match trimmed.split_once('d') {
        Some(parts) => parts,
        None => return Err(ParseError::InvalidFormat),
    };

    // Immutable + mutable variables are both used in this parser.
    let count = if count_part.is_empty() {
        1
    } else {
        parse_positive_u32(count_part)?
    };

    let mut modifier: i32 = 0;
    let mut sides_part = rest;

    for (idx, ch) in rest.char_indices() {
        // Use match for token handling in the parser.
        match ch {
            '+' | '-' if idx > 0 => {
                sides_part = &rest[..idx];
                modifier = parse_i32(&rest[idx..])?;
                break;
            }
            _ => {}
        }
    }

    let sides = parse_positive_u32(sides_part)?;

    // Keep unsupported cases simple for coursework and predictable UI behavior.
    if count > 100 || sides > 10_000 {
        return Err(ParseError::Unsupported);
    }

    Ok(DiceSpec {
        count,
        sides,
        modifier,
    })
}

/// Rolls `count` dice with `sides` sides and stores each result in a Vec.
pub fn roll_dice(count: u32, sides: u32) -> Vec<u32> {
    let mut rng = rand::thread_rng();
    let mut results = Vec::new();

    // Loop requirement: roll each die in a for-loop.
    for _ in 0..count {
        let roll_value = rng.gen_range(1..=sides);
        results.push(roll_value);
    }

    results
}

/// Borrowing example: caller keeps ownership of `notation`.
pub fn make_roll(notation: &str) -> Result<Roll, ParseError> {
    let spec = parse_notation(notation)?;
    let results = roll_dice(spec.count, spec.sides);

    let dice_sum: i32 = results.iter().map(|&r| r as i32).sum();
    let total = dice_sum + spec.modifier;

    Ok(Roll {
        notation: notation.to_string(),
        results,
        total,
    })
}

/// Ownership-transfer example: this function consumes the String argument.
pub fn make_roll_owned(notation: String) -> Result<Roll, ParseError> {
    let mut roll = make_roll(&notation)?;
    roll.notation = notation;
    Ok(roll)
}

fn parse_positive_u32(input: &str) -> Result<u32, ParseError> {
    let value = input
        .parse::<u32>()
        .map_err(|_| ParseError::InvalidNumber)?;

    if value == 0 {
        return Err(ParseError::InvalidNumber);
    }

    Ok(value)
}

fn parse_i32(input: &str) -> Result<i32, ParseError> {
    input
        .parse::<i32>()
        .map_err(|_| ParseError::InvalidNumber)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_standard_notation() {
        let spec = parse_notation("2d6+1").expect("2d6+1 should parse");
        assert_eq!(spec.count, 2);
        assert_eq!(spec.sides, 6);
        assert_eq!(spec.modifier, 1);
    }

    #[test]
    fn parse_default_count() {
        let spec = parse_notation("d20").expect("d20 should parse");
        assert_eq!(spec.count, 1);
        assert_eq!(spec.sides, 20);
        assert_eq!(spec.modifier, 0);
    }

    #[test]
    fn parse_negative_modifier() {
        let spec = parse_notation("4d8-2").expect("4d8-2 should parse");
        assert_eq!(spec.count, 4);
        assert_eq!(spec.sides, 8);
        assert_eq!(spec.modifier, -2);
    }

    #[test]
    fn parse_invalid_format() {
        let err = parse_notation("2x6").expect_err("2x6 should fail parsing");
        assert_eq!(err, ParseError::InvalidFormat);
    }

    #[test]
    fn roll_dice_returns_count_and_ranges() {
        let results = roll_dice(10, 6);
        assert_eq!(results.len(), 10);

        for value in results {
            assert!((1..=6).contains(&value));
        }
    }

    #[test]
    fn make_roll_returns_valid_total_range() {
        let roll = make_roll("2d6+1").expect("2d6+1 should roll");
        assert_eq!(roll.results.len(), 2);
        assert!((3..=13).contains(&roll.total));
    }

    #[test]
    fn make_roll_owned_consumes_string() {
        let notation = String::from("d4");
        let roll = make_roll_owned(notation).expect("owned notation should work");
        assert_eq!(roll.notation, "d4");
        assert_eq!(roll.results.len(), 1);
    }
}
