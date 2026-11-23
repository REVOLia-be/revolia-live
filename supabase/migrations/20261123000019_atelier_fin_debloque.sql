-- Terminer l'atelier retire le signal « bloqué ».
create or replace function public.atelier_aller_a(p_question uuid, p_etape int)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  moi  public.participants := public.atelier_verifier_participant(p_question);
  nb   int;
  pa   public.progression_atelier;
begin
  select count(*) into nb from public.etapes_session where question_id = p_question;
  if p_etape is null or p_etape < 1 or p_etape > nb + 1 then
    raise exception 'Cette étape n''existe pas.' using errcode = '22023';
  end if;
  insert into public.progression_atelier (session_id, question_id, participant_id, etape, termine)
  values (moi.session_id, p_question, moi.id, p_etape, p_etape = nb + 1)
  on conflict (question_id, participant_id)
  do update set etape = excluded.etape, termine = excluded.termine, maj_le = now(),
    -- Terminer l'atelier retire le signal « bloqué » (sinon la personne resterait comptée bloquée)
    bloque_depuis = case when excluded.termine then null else public.progression_atelier.bloque_depuis end,
    en_route      = case when excluded.termine then false else public.progression_atelier.en_route end
  returning * into pa;
  return jsonb_build_object('etape', pa.etape, 'termine', pa.termine,
                            'bloque', pa.bloque_depuis is not null, 'en_route', pa.en_route);
end $$;
