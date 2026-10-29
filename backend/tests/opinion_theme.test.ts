import {describe,it,expect} from 'vitest';
import {contrastText,opinionTheme} from '../../frontend/src/utils/opinionTheme';
describe('anonymous edition appearance without depending on signed-in configuration',()=>{
 it('uses contrasting foregrounds for both light and dark colors',()=>{expect(contrastText('#fff')).toBe('#000000');expect(contrastText('#000000')).toBe('#ffffff');expect(opinionTheme({primaryColor:'#ffffff',backgroundColor:'#ffffff'})).toMatchObject({'--primary-foreground':'0 0% 0%','--foreground':'0 0% 0%',colorScheme:'light'});expect(opinionTheme({primaryColor:'#000000',backgroundColor:'#000000'})).toMatchObject({'--primary-foreground':'0 0% 100%',colorScheme:'dark'});});
 it('falls back safely before public configuration loads or when colors are invalid',()=>{expect(opinionTheme(null)).toEqual(opinionTheme({primaryColor:'invalid',backgroundColor:'url(invalid)'}));expect(opinionTheme()['--primary']).toBe('221 83% 53%');});
});
