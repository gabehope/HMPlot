<script>
 import {useThrelte} from '@threlte/core';
 const {camera}=useThrelte();
 export const read=()=>({zoom:camera.current?.zoom,x:camera.current?.position.x,y:camera.current?.position.y});
</script>
