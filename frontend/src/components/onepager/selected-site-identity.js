// Decorative entrance only: final artwork is visible if scripting, observers or motion are unavailable.
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const running=new Set();
function reveal(mark){
 if(mark.dataset.brandEntrancePlayed)return;
 mark.dataset.brandEntrancePlayed='true';
 if(reduced.matches||!Element.prototype.animate)return;
 const ateles=mark.dataset.brandEntrance==='ateles';
 for(const part of mark.querySelectorAll('[data-brand-part]')){
  const index=Number(part.dataset.brandPart);
  const delay=ateles?(index===0?70:0):(2-index)*90;
  const frames=ateles?[
   {clipPath:'inset(95% 0 0 0)',transform:'rotate(-5deg) scaleX(.9)'},
   {clipPath:'inset(0% 0 0 0)',transform:'rotate(0deg) scaleX(1)'}
  ]:[
   {transform:'translateY(-3px)',opacity:.15},
   {transform:'translateY(0px)',opacity:1}
  ];
  const animation=part.animate(frames,{duration:ateles?680:550,delay,easing:'cubic-bezier(.22,.7,.2,1)',fill:'both'});
  running.add(animation);
  animation.finished.then(()=>{running.delete(animation);animation.cancel();}).catch(()=>running.delete(animation));
 }
}
const marks=document.querySelectorAll('[data-brand-entrance]');
if('IntersectionObserver' in window&&!reduced.matches){
 const observer=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){reveal(entry.target);observer.unobserve(entry.target);}
 },{threshold:.25});
 marks.forEach(mark=>observer.observe(mark));
}else marks.forEach(mark=>mark.dataset.brandEntrancePlayed='true');
reduced.addEventListener('change',event=>{if(event.matches)for(const animation of running)animation.cancel();});
