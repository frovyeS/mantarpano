// Geometry helpers shared by card transforms and thread rendering.
export function cardPin(card){const w=card.offsetWidth,m=new DOMMatrix().translate(w/2,0).rotate(+(card.dataset.r||0)).scale(+(card.dataset.s||1)).translate(-w/2,0),q=m.transformPoint({x:w/2,y:2});return{x:card.offsetLeft+q.x,y:card.offsetTop+q.y};}
export function pointOnQuadratic(g,p){return{x:(1-p)**2*g.a.x+2*p*(1-p)*g.cx+p*p*g.b.x,y:(1-p)**2*g.a.y+2*p*(1-p)*g.cy+p*p*g.b.y};}
