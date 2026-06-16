fn main() {
    let result = compute(10);
    println!("{}", format_result(result));
}

fn compute(n: i32) -> i32 {
    multiply(n, 2)
}

fn multiply(a: i32, b: i32) -> i32 {
    a * b
}

fn format_result(n: i32) -> String {
    format!("Result: {}", n)
}
