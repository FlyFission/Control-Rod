/** Writer capability floor. This refuses unaware binaries; it grants no lifecycle authority. */
export const PREPARATION_PROTOCOL = "0.1.0";
export const COMPATIBILITY_SQL = `
create function preparation_writer_floor() returns trigger language plpgsql as $$
declare payload jsonb; subject_id text;
begin
 if TG_OP='DELETE' then payload=to_jsonb(OLD); else payload=to_jsonb(NEW); end if;
 subject_id=case when TG_TABLE_NAME='packages' then payload->>'id' else payload->>'package_id' end;
 if exists(select 1 from preparation_heads where package_id=subject_id)
    and current_setting('controlrod.preparation_protocol',true) is distinct from '${PREPARATION_PROTOCOL}' then
  raise exception 'Prepared package requires writer protocol ${PREPARATION_PROTOCOL}; refusing an unaware writer' using errcode='0A000';
 end if;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
create trigger preparation_package_writer before insert or update or delete on packages for each row execute function preparation_writer_floor();
create trigger preparation_run_writer before insert or update or delete on runs for each row execute function preparation_writer_floor();
create trigger preparation_output_writer before insert or update or delete on outputs for each row execute function preparation_writer_floor();
create trigger preparation_verification_writer before insert or update or delete on verifications for each row execute function preparation_writer_floor();
create trigger preparation_decision_writer before insert or update or delete on decisions for each row execute function preparation_writer_floor();
`;
