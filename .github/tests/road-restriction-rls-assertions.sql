-- Isolated tenant-boundary and verified-record RLS integration checks.
-- The database is disposable CI PostgreSQL; all fixture data stays inside this run.
DO $$
DECLARE
  fleet_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  fleet_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  user_a uuid := '11111111-1111-4111-8111-111111111111';
  user_b uuid := '22222222-2222-4222-8222-222222222222';
  unverified_id uuid;
  verified_id uuid;
  visible_count integer;
  affected integer;
BEGIN
  INSERT INTO public.fleets (id) VALUES (fleet_a),(fleet_b);
  INSERT INTO public.fleet_members (fleet_id,user_id,role)
  VALUES (fleet_a,user_a,'owner'),(fleet_b,user_b,'owner');

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  INSERT INTO public.road_restrictions (fleet_id,road_name,restriction_type)
  VALUES (fleet_a,'Unverified test restriction','height')
  RETURNING id INTO unverified_id;

  INSERT INTO public.road_restrictions (
    fleet_id,road_name,restriction_type,max_height_m,latitude,longitude,
    source_url,verification_status,verified_at,verified_by,
    source_last_checked_at,verification_note
  ) VALUES (
    fleet_a,'Verified test restriction','height',4.2,32.0,34.8,
    'https://example.gov.il/test','verified',now(),user_a,
    now(),'Verified against official test source with dimensions checked.'
  ) RETURNING id INTO verified_id;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',user_a::text,true);

  SELECT count(*) INTO visible_count
  FROM public.road_restrictions WHERE id IN (unverified_id,verified_id);
  IF visible_count <> 2 THEN
    RAISE EXCEPTION 'Fleet owner should see both restrictions in their own fleet';
  END IF;

  BEGIN
    UPDATE public.road_restrictions SET notes='tampered' WHERE id=verified_id;
    RAISE EXCEPTION 'Expected verified metadata update to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.road_restrictions WHERE id=verified_id;
    RAISE EXCEPTION 'Expected verified restriction deletion to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN RAISE; END IF;
  END;

  UPDATE public.road_restrictions SET notes='owner can edit unverified note' WHERE id=unverified_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Fleet owner should be able to update an unverified record'; END IF;

  PERFORM set_config('request.jwt.claim.sub',user_b::text,true);
  SELECT count(*) INTO visible_count
  FROM public.road_restrictions WHERE id IN (unverified_id,verified_id);
  IF visible_count <> 0 THEN RAISE EXCEPTION 'Cross-fleet restriction visibility detected'; END IF;

  UPDATE public.road_restrictions SET notes='cross-tenant tamper' WHERE id=verified_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-fleet update was not blocked by RLS'; END IF;

  DELETE FROM public.road_restrictions WHERE id=verified_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Cross-fleet delete was not blocked by RLS'; END IF;

  PERFORM set_config('request.jwt.claim.sub',user_a::text,true);
  DELETE FROM public.road_restrictions WHERE id=unverified_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Fleet owner should be able to delete an unverified record'; END IF;
END;
$$;
