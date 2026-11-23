begin;
create or replace function public.salvar_identidade(p_oficina uuid,p_dados jsonb) returns void language plpgsql security definer set search_path='' as $$
declare logo text:=coalesce(p_dados->>'logo',''); pix text:=coalesce(p_dados->>'pix_qr','');begin
 perform private.exigir_gestao(p_oficina,'customers');
 if p_dados is null or coalesce(p_dados->>'cor','')!~'^#[a-fA-F0-9]{6}$' or length(coalesce(p_dados->>'rodape',''))>300 or length(logo)>160000 or (logo<>'' and logo!~'^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then raise exception 'Confira cor, logo e rodapé.' using errcode='22023';end if;
 if length(pix)>1000000 or (pix<>'' and pix!~'^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then raise exception 'Envie um QR Code Pix em PNG ou JPG.' using errcode='22023';end if;
 update public.oficinas set identidade_documentos=coalesce(identidade_documentos,'{}'::jsonb)||jsonb_build_object('pix_qr',case when p_dados ? 'pix_qr' then pix else coalesce(identidade_documentos->>'pix_qr','') end,'cor',p_dados->>'cor','logo',logo,'rodape',coalesce(p_dados->>'rodape','')) where id=p_oficina;
end $$;
commit;
