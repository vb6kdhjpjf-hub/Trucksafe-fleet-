import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "validate_schema_snapshot.py"
SPEC = importlib.util.spec_from_file_location("snapshot_validator", MODULE)
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class SnapshotValidatorTests(unittest.TestCase):
    def rejects(self, sql):
        with self.assertRaises(validator.SnapshotValidationError):
            validator.validate_schema_only_snapshot(sql)

    def accepts(self, sql):
        validator.validate_schema_only_snapshot(sql)

    def test_rejects_copy_data_block(self):
        self.rejects("COPY public.items (id) FROM stdin;\n1\n\\\\.\n")

    def test_rejects_insert_statement(self):
        self.rejects("INSERT INTO public.items VALUES (1);")
        self.rejects("WITH source AS (SELECT 1) INSERT INTO public.items SELECT * FROM source;")

    def test_rejects_case_and_whitespace_variants(self):
        self.rejects("\n  insert\n into public.items values (1);")
        self.rejects("COPY public.items FROM STDIN;")
        self.rejects("COPY public.items FROM STDIN WITH (FORMAT csv);")
        self.rejects("COPY public.items FROM PROGRAM 'dangerous-command';")

    def test_ignores_insert_and_copy_inside_dollar_body(self):
        self.accepts("""CREATE FUNCTION f() RETURNS void AS $body$
BEGIN
  INSERT INTO public.items VALUES (1);
  COPY public.items FROM stdin;
END
$body$ LANGUAGE plpgsql;""")

    def test_handles_same_line_dollar_open_and_close(self):
        self.accepts("CREATE FUNCTION f() RETURNS text AS $$ INSERT INTO t VALUES(1); $$ LANGUAGE sql;")

    def test_scans_sql_after_same_line_dollar_close(self):
        self.rejects("CREATE FUNCTION f() RETURNS text AS $$ SELECT 1 $$ LANGUAGE sql; INSERT INTO t VALUES(1);")

    def test_ignores_keywords_in_single_quoted_strings(self):
        self.accepts("SELECT 'INSERT INTO t VALUES (1); COPY t FROM stdin;';")

    def test_ignores_keywords_in_escape_strings(self):
        sql = "SELECT E'quote: " + chr(92) + "' INSERT INTO t VALUES (1);';"
        self.accepts(sql)

    def test_ignores_line_and_nested_block_comments(self):
        self.accepts("-- INSERT INTO t VALUES (1);\n/* outer /* COPY t FROM stdin; */ end */ SELECT 1;")

    def test_detects_statement_after_comments(self):
        self.rejects("/* comment */\n INSERT INTO t VALUES (1);")

    def test_rejects_unterminated_lexical_constructs(self):
        self.rejects("SELECT 'unterminated")
        self.rejects("SELECT $$unterminated")
        self.rejects("/* unterminated")

    def test_rejects_empty_snapshot(self):
        self.rejects("  -- empty schema\n")

    def test_rejects_nonstandard_string_mode(self):
        self.rejects("SET standard_conforming_strings = off; SELECT 1;")
        self.rejects("SET SESSION standard_conforming_strings TO off;")
        self.rejects("SET standard_conforming_strings TO 'off';")
        self.rejects("SET standard_conforming_strings = off")
        self.rejects("SET SESSION standard_conforming_strings TO off")
        self.accepts("SET standard_conforming_strings = on")
        self.accepts("SET standard_conforming_strings = on; SELECT 'safe';")

    def test_does_not_treat_identifier_dollar_as_quote(self):
        self.accepts("SELECT column$tag$ FROM public.items;")

    def test_requires_exact_dollar_quote_tag(self):
        self.rejects("SELECT $tag$ harmless $other$; INSERT INTO t VALUES (1);")


if __name__ == "__main__":
    unittest.main()
