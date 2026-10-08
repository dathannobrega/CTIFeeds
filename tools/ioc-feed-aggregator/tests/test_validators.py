from app.services.validators import detect_indicator_type, refang


def test_refang():
    assert refang("hxxps://evil[.]example[/]a") == "https://evil.example/a"
    assert refang(" 1.2.3(.)4 ") == "1.2.3.4"
    assert refang("bad[dot]test") == "bad.test"


def test_detect_indicator_type():
    assert detect_indicator_type("203.0.113.1") == "ipv4"
    assert detect_indicator_type("2001:db8::1") is None
    assert detect_indicator_type("https://x.test/a") == "url"
    assert detect_indicator_type("x.test") == "domain"
    assert detect_indicator_type("x.test/path") is None
    assert detect_indicator_type("a b") is None
