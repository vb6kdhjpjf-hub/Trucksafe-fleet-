DO $$
DECLARE
  restriction_id uuid;
  incomplete_id uuid;
  current_status text;
BEGIN
  INSERT INTO public.road_restrictions (fleet_id, road_name, restriction_type)
  VALUES (gen_random_uuid(), 'Test bridge', 'height')
  RETURNING id INTO restriction_id;

  SELECT verification_status INTO current_status
  FROM public.road_restrictions WHERE id = restriction_id;
  IF current_status <> 'unverified' THEN
    RAISE EXCEPTION 'New road restrictions must default to unverified';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    UPDATE public.road_restrictions
    SET verification_status = 'verified',
        source_url = 'https://example.gov.il/bridge',
        verified_at = now(),
        verified_by = gen_random_uuid(),
      source_last_checked_at = now(),
      verification_note = $note$Checked official notice and verified dimensions against the source document.$note$
    WHERE id = restriction_id;
    RAISE EXCEPTION 'Expected authenticated verification to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN
      RAISE;
    END IF;
  END;

  SELECT verification_status INTO current_status
  FROM public.road_restrictions WHERE id = restriction_id;
  IF current_status <> 'unverified' THEN
    RAISE EXCEPTION 'Authenticated user changed verification status';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  UPDATE public.road_restrictions
  SET latitude = 32.0,
      longitude = 34.8,
      radius_m = 100,
      max_height_m = 4.2,
      source_url = 'https://example.gov.il/bridge',
      verification_status = 'verified',
      verified_at = now(),
      verified_by = gen_random_uuid(),
      source_last_checked_at = now(),
      verification_note = $note$Checked official notice and verified dimensions against the source document.$note$
  WHERE id = restriction_id;

  SELECT verification_status INTO current_status
  FROM public.road_restrictions WHERE id = restriction_id;
  IF current_status <> 'verified' THEN
    RAISE EXCEPTION 'Service role could not verify a restriction';
  END IF;

  INSERT INTO public.road_restrictions (fleet_id, road_name, restriction_type, latitude, longitude, source_url)
  VALUES (gen_random_uuid(), 'Incomplete test bridge', 'height', 32.0, 34.8, 'https://example.gov.il/bridge')
  RETURNING id INTO incomplete_id;
  BEGIN
    UPDATE public.road_restrictions
    SET verification_status = 'verified', verified_at = now(), verified_by = gen_random_uuid(),
        source_last_checked_at = now(), verification_note = 'Reviewed but deliberately missing height limit.'
    WHERE id = incomplete_id;
    RAISE EXCEPTION 'Expected verified record without a numeric limit to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    UPDATE public.road_restrictions SET latitude = 32.1 WHERE id = restriction_id;
    RAISE EXCEPTION 'Expected verified restriction edits to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    UPDATE public.road_restrictions SET latitude = 90 WHERE id = restriction_id;
    RAISE EXCEPTION 'Expected invalid latitude to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- The follow-up hardening migration must also protect ownership and audit metadata.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    UPDATE public.road_restrictions SET notes = 'tampered notes' WHERE id = restriction_id;
    RAISE EXCEPTION 'Expected verified notes edits to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.road_restrictions SET fleet_id = gen_random_uuid() WHERE id = restriction_id;
    RAISE EXCEPTION 'Expected verified fleet reassignment to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.road_restrictions SET created_by = gen_random_uuid() WHERE id = restriction_id;
    RAISE EXCEPTION 'Expected verified creator edits to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.road_restrictions SET created_at = created_at + interval '1 minute' WHERE id = restriction_id;
    RAISE EXCEPTION 'Expected verified creation timestamp edits to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.road_restrictions WHERE id = restriction_id;
    RAISE EXCEPTION 'Expected verified restriction deletion to be blocked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%requires trusted administrative review%' THEN RAISE; END IF;
  END;
END;
$$;
